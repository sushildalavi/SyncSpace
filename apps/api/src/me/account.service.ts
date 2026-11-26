import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import { and, count, eq, gt, inArray, like, ne, or, sql } from "drizzle-orm";
import type { IncomingHttpHeaders } from "node:http";
import type { AccountDeleteInput } from "@syncspace/contracts";
import { AuditService } from "../audit/audit.service.js";
import { AUTH } from "../auth/auth.constants.js";
import type { Auth } from "../auth/auth.factory.js";
import type { AuthContext } from "../auth/session.guard.js";
import { DB, type Db } from "../db/database.module.js";
import {
  account,
  auditEvent,
  document,
  documentShare,
  documentUpdate,
  session,
  user,
  verification,
  workspace,
  workspaceIntegration,
  workspaceInvitation,
  workspaceMember
} from "../db/schema.js";
import { RealtimeBus } from "../realtime/realtimeBus.service.js";

/** Stands in as the author of whatever a deleted person wrote in places other people still use. */
export const DELETED_USER_ID = "deleted-user";
export const DELETED_USER = { id: DELETED_USER_ID, name: "Deleted user", email: "deleted-user@syncspace.invalid" } as const;

/** Without a password to confirm (Google-only accounts), deletion needs a sign-in this recent. */
const FRESH_SESSION_MS = 10 * 60 * 1000;
const MAX_PASSWORD_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

@Injectable()
export class AccountService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RealtimeBus) private readonly bus: Pick<RealtimeBus, "publish">
  ) {}

  /** What deleting this account would do, so the person can decide with the facts in front of them. */
  async deletionPreview(userId: string) {
    const plan = await this.plan(this.db, userId);
    return { requiresPassword: await this.hasPassword(userId), workspacesToDelete: plan.remove, blockers: plan.blockers };
  }

  async delete(current: AuthContext, input: AccountDeleteInput, headers: IncomingHttpHeaders) {
    const { id: userId, email } = current.user;
    if (input.confirmEmail !== email.toLowerCase()) {
      throw new BadRequestException("Type your own email address to confirm");
    }
    await this.reauthenticate(current, input.password, headers);

    const outcome = await this.db.transaction(async (tx) => {
      // Lock the memberships involved, so another owner can't leave while we rely on them staying.
      await tx.execute(sql`select 1 from ${workspaceMember} where ${workspaceMember.workspaceId} in
        (select workspace_id from workspace_member where user_id = ${userId}) for update`);
      const plan = await this.plan(tx, userId);
      if (plan.blockers.length > 0) {
        throw new ConflictException(
          `Make someone else an owner first: ${plan.blockers.map((item) => item.name).join(", ")}`
        );
      }
      const sessions = await tx.select({ id: session.id }).from(session).where(eq(session.userId, userId));
      const removedIds = plan.remove.map((item) => item.id);
      const removedDocuments = removedIds.length
        ? await tx.select({ id: document.id }).from(document).where(inArray(document.workspaceId, removedIds))
        : [];
      if (removedIds.length) {
        await tx.delete(workspace).where(inArray(workspace.id, removedIds));
      }

      // Workspaces that live on get an owner who still exists.
      const owned = await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.ownerId, userId));
      for (const item of owned) {
        const [heir] = await tx
          .select({ userId: workspaceMember.userId })
          .from(workspaceMember)
          .where(and(eq(workspaceMember.workspaceId, item.id), eq(workspaceMember.role, "owner"), ne(workspaceMember.userId, userId)))
          .limit(1);
        await tx.update(workspace).set({ ownerId: heir?.userId ?? DELETED_USER_ID }).where(eq(workspace.id, item.id));
      }

      // Shared history stays intact, without the person's identity attached to it.
      await tx.insert(user).values({ ...DELETED_USER, emailVerified: false }).onConflictDoNothing();
      await tx.update(document).set({ createdBy: DELETED_USER_ID, updatedAt: sql`updated_at` }).where(eq(document.createdBy, userId));
      await tx.update(document).set({ updatedBy: DELETED_USER_ID, updatedAt: sql`updated_at` }).where(eq(document.updatedBy, userId));
      await tx.update(documentUpdate).set({ actorId: DELETED_USER_ID }).where(eq(documentUpdate.actorId, userId));
      await tx.update(workspaceIntegration).set({ createdBy: DELETED_USER_ID }).where(eq(workspaceIntegration.createdBy, userId));
      await tx.update(workspaceIntegration).set({ updatedBy: DELETED_USER_ID }).where(eq(workspaceIntegration.updatedBy, userId));

      // Personal data that is addressed by email, or that would otherwise only be detached.
      const address = email.toLowerCase();
      await tx.delete(documentShare).where(or(eq(documentShare.userId, userId), eq(documentShare.email, address)));
      await tx.delete(workspaceInvitation).where(eq(workspaceInvitation.email, address));
      await tx.delete(verification).where(or(eq(verification.value, userId), eq(verification.identifier, address)));
      await tx.delete(auditEvent).where(and(eq(auditEvent.actorId, userId), like(auditEvent.type, "auth.%")));
      await tx.update(auditEvent).set({ ipAddress: null }).where(eq(auditEvent.actorId, userId));
      await tx.update(auditEvent).set({ metadata: sql`${auditEvent.metadata} - 'email'` }).where(sql`${auditEvent.metadata} ->> 'email' = ${address}`);

      // Cascades to sessions, sign-in methods, two-factor secrets, memberships, favorites and views.
      await tx.delete(user).where(eq(user.id, userId));
      await this.audit.record({ type: "account.deleted", metadata: { workspacesDeleted: removedIds.length } }, tx);
      return { sessions, removedDocuments };
    });

    // Close anything still open. The periodic revalidation catches whatever these miss.
    await Promise.all([
      ...outcome.sessions.map((item) => this.bus.publish({ type: "session.revoked", userId, sessionId: item.id })),
      ...outcome.removedDocuments.map((item) => this.bus.publish({ type: "document.deleted", documentId: item.id }))
    ]);
  }

  private async hasPassword(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .limit(1);
    return Boolean(row);
  }

  private async reauthenticate(current: AuthContext, password: string | undefined, headers: IncomingHttpHeaders): Promise<void> {
    const userId = current.user.id;
    if (!(await this.hasPassword(userId))) {
      const [row] = await this.db.select({ createdAt: session.createdAt }).from(session).where(eq(session.id, current.sessionId)).limit(1);
      if (!row || Date.now() - row.createdAt.getTime() > FRESH_SESSION_MS) {
        throw new ForbiddenException("Sign out, sign in again, then delete your account within 10 minutes");
      }
      return;
    }
    if (!password) {
      throw new BadRequestException("Enter your password to confirm");
    }
    // This check runs outside Better Auth's HTTP rate limiter, so it keeps its own count in the database. The
    // attempt is recorded BEFORE the password is checked, so simultaneous guesses can't all slip under the limit.
    const [attempt] = await this.db.insert(auditEvent).values({ actorId: userId, type: "account.delete_denied" }).returning({ id: auditEvent.id });
    const [recent] = await this.db
      .select({ total: count() })
      .from(auditEvent)
      .where(
        and(eq(auditEvent.actorId, userId), eq(auditEvent.type, "account.delete_denied"), gt(auditEvent.createdAt, new Date(Date.now() - FAILURE_WINDOW_MS)))
      );
    if ((recent?.total ?? 0) > MAX_PASSWORD_FAILURES) {
      throw new HttpException("Too many attempts. Try again in 15 minutes.", HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      await this.auth.api.verifyPassword({ body: { password }, headers: fromNodeHeaders(headers) });
    } catch {
      throw new BadRequestException("That password isn't correct");
    }
    await this.db.delete(auditEvent).where(eq(auditEvent.id, attempt!.id));
  }

  private async plan(executor: Db | Tx, userId: string) {
    const memberships = await executor
      .select({
        id: workspace.id,
        name: workspace.name,
        archivedAt: workspace.archivedAt,
        role: workspaceMember.role,
        otherMembers: sql<number>`(select count(*)::int from workspace_member m where m.workspace_id = ${workspace.id} and m.user_id <> ${userId})`,
        otherOwners: sql<number>`(select count(*)::int from workspace_member m where m.workspace_id = ${workspace.id} and m.user_id <> ${userId} and m.role = 'owner')`,
        documentCount: sql<number>`(select count(*)::int from document d where d.workspace_id = ${workspace.id} and d.deleted_at is null)`
      })
      .from(workspaceMember)
      .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
      .where(eq(workspaceMember.userId, userId));

    const remove: Array<{ id: string; name: string; documentCount: number }> = [];
    const blockers: Array<{ id: string; name: string }> = [];
    for (const item of memberships) {
      const soleOwner = item.role === "owner" && item.otherOwners === 0;
      // Nobody else would be left, or it is already archived and only this person could have managed it.
      if (item.otherMembers === 0 || (soleOwner && item.archivedAt)) {
        remove.push({ id: item.id, name: item.name, documentCount: item.documentCount });
      } else if (soleOwner) {
        blockers.push({ id: item.id, name: item.name });
      }
    }
    return { remove, blockers };
  }
}
