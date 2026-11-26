import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, count, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { ROLE_PERMISSIONS, type WorkspaceRole } from "@syncspace/contracts";
import { AccessService } from "../access/access.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedUser } from "../auth/session.guard.js";
import { DB, type Db } from "../db/database.module.js";
import { document, user, workspace, workspaceInvitation, workspaceMember } from "../db/schema.js";
import { MailerService } from "../mail/mailer.service.js";
import { actionEmail } from "../mail/templates.js";
import { RealtimeBus } from "../realtime/realtimeBus.service.js";
import { APP_ENV, type AppEnv } from "../common/appEnv.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RealtimeBus) private readonly bus: Pick<RealtimeBus, "publish">,
    @Inject(MailerService) private readonly mailer: Pick<MailerService, "send">,
    @Inject(APP_ENV) private readonly env: Pick<AppEnv, "WEB_ORIGIN">
  ) {}

  async listForUser(userId: string) {
    const rows = await this.db
      .select({
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.ownerId,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        role: workspaceMember.role,
        documentCount: sql<number>`(select count(*)::int from ${document} d where d.workspace_id = ${workspace.id} and d.deleted_at is null)`,
        memberCount: sql<number>`(select count(*)::int from ${workspaceMember} m where m.workspace_id = ${workspace.id})`
      })
      .from(workspaceMember)
      .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
      .where(and(eq(workspaceMember.userId, userId), isNull(workspace.archivedAt)))
      .orderBy(asc(workspace.createdAt));
    return rows;
  }

  /** The workspace row and the workspace_member row are written in one transaction. */
  async create(name: string, actor: AuthenticatedUser, ip?: string) {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(workspace).values({ name, ownerId: actor.id }).returning();
      await tx.insert(workspaceMember).values({ workspaceId: created!.id, userId: actor.id, role: "owner" });
      await this.audit.record({ type: "workspace.created", actorId: actor.id, workspaceId: created!.id, ip }, tx);
      return { ...created!, role: "owner" as const };
    });
  }

  async get(workspaceId: string, userId: string) {
    const role = await this.access.requireWorkspace(workspaceId, userId, "workspace.read");
    const [row] = await this.db.select().from(workspace).where(eq(workspace.id, workspaceId)).limit(1);
    if (!row) {
      throw new NotFoundException("Workspace not found");
    }
    return { ...row, role, permissions: ROLE_PERMISSIONS[role] };
  }

  async rename(workspaceId: string, actor: AuthenticatedUser, name: string) {
    await this.access.requireWorkspace(workspaceId, actor.id, "workspace.update");
    const [row] = await this.db.update(workspace).set({ name }).where(eq(workspace.id, workspaceId)).returning();
    await this.audit.record({ type: "workspace.renamed", actorId: actor.id, workspaceId, metadata: { name } });
    return row;
  }

  async archive(workspaceId: string, actor: AuthenticatedUser, ip?: string) {
    await this.access.requireWorkspace(workspaceId, actor.id, "workspace.delete");
    const members = await this.db.select({ userId: workspaceMember.userId }).from(workspaceMember).where(eq(workspaceMember.workspaceId, workspaceId));
    await this.db.transaction(async (tx) => {
      await tx.update(workspace).set({ archivedAt: new Date() }).where(eq(workspace.id, workspaceId));
      await this.audit.record({ type: "workspace.archived", actorId: actor.id, workspaceId, ip }, tx);
    });
    await Promise.all(members.map((m) => this.bus.publish({ type: "access.changed", workspaceId, userId: m.userId, role: null })));
  }

  async listMembers(workspaceId: string, userId: string) {
    await this.access.requireWorkspace(workspaceId, userId, "workspace.read");
    return this.db
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: workspaceMember.role,
        joinedAt: workspaceMember.createdAt
      })
      .from(workspaceMember)
      .innerJoin(user, eq(user.id, workspaceMember.userId))
      .where(eq(workspaceMember.workspaceId, workspaceId))
      .orderBy(asc(workspaceMember.createdAt));
  }

  /* ---------------- invitations ---------------- */

  async listInvitations(workspaceId: string, userId: string) {
    await this.access.requireWorkspace(workspaceId, userId, "member.manage");
    return this.db
      .select({
        id: workspaceInvitation.id,
        email: workspaceInvitation.email,
        role: workspaceInvitation.role,
        expiresAt: workspaceInvitation.expiresAt,
        createdAt: workspaceInvitation.createdAt
      })
      .from(workspaceInvitation)
      .where(
        and(
          eq(workspaceInvitation.workspaceId, workspaceId),
          isNull(workspaceInvitation.acceptedAt),
          isNull(workspaceInvitation.revokedAt),
          gt(workspaceInvitation.expiresAt, new Date())
        )
      )
      .orderBy(desc(workspaceInvitation.createdAt));
  }

  async invite(workspaceId: string, actor: AuthenticatedUser, email: string, role: WorkspaceRole, ip?: string) {
    await this.access.requireWorkspace(workspaceId, actor.id, "member.manage");
    const normalized = email.toLowerCase();

    const [existingMember] = await this.db
      .select({ userId: user.id })
      .from(user)
      .innerJoin(workspaceMember, and(eq(workspaceMember.userId, user.id), eq(workspaceMember.workspaceId, workspaceId)))
      .where(eq(user.email, normalized))
      .limit(1);
    if (existingMember) {
      throw new ConflictException("That person is already a member of this workspace");
    }

    const token = randomBytes(32).toString("base64url");
    const invitation = await this.db.transaction(async (tx) => {
      await tx
        .update(workspaceInvitation)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(workspaceInvitation.workspaceId, workspaceId),
            eq(workspaceInvitation.email, normalized),
            isNull(workspaceInvitation.acceptedAt),
            isNull(workspaceInvitation.revokedAt)
          )
        );
      const [row] = await tx
        .insert(workspaceInvitation)
        .values({
          workspaceId,
          email: normalized,
          role,
          invitedBy: actor.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS)
        })
        .returning();
      await this.audit.record({ type: "invitation.created", actorId: actor.id, workspaceId, metadata: { email: normalized, role }, ip }, tx);
      return row!;
    });

    const [ws] = await this.db.select({ name: workspace.name }).from(workspace).where(eq(workspace.id, workspaceId)).limit(1);
    const mail = actionEmail({
      heading: `${actor.name} invited you to ${ws?.name ?? "a workspace"}`,
      body: `You've been invited to collaborate as ${role === "owner" ? "an owner" : `an ${role === "editor" ? "editor" : "viewer"}`}. The invitation expires in 7 days.`,
      actionLabel: "Review invitation",
      url: `${this.env.WEB_ORIGIN}/invite?token=${encodeURIComponent(token)}`
    });
    await this.mailer.send({ to: normalized, subject: `Invitation to ${ws?.name ?? "SyncSpace"}`, ...mail });

    return { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt };
  }

  async revokeInvitation(workspaceId: string, invitationId: string, actor: AuthenticatedUser) {
    await this.access.requireWorkspace(workspaceId, actor.id, "member.manage");
    const rows = await this.db
      .update(workspaceInvitation)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(workspaceInvitation.id, invitationId),
          eq(workspaceInvitation.workspaceId, workspaceId),
          isNull(workspaceInvitation.acceptedAt),
          isNull(workspaceInvitation.revokedAt)
        )
      )
      .returning({ id: workspaceInvitation.id });
    if (rows.length === 0) {
      throw new NotFoundException("Invitation not found");
    }
  }

  /** Invitations addressed to the signed-in user's *verified* email. */
  async listMine(actor: AuthenticatedUser) {
    if (!actor.emailVerified) {
      return [];
    }
    return this.db
      .select({
        id: workspaceInvitation.id,
        role: workspaceInvitation.role,
        expiresAt: workspaceInvitation.expiresAt,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        invitedByName: user.name
      })
      .from(workspaceInvitation)
      .innerJoin(workspace, eq(workspace.id, workspaceInvitation.workspaceId))
      .innerJoin(user, eq(user.id, workspaceInvitation.invitedBy))
      .where(
        and(
          eq(workspaceInvitation.email, actor.email.toLowerCase()),
          isNull(workspaceInvitation.acceptedAt),
          isNull(workspaceInvitation.revokedAt),
          isNull(workspace.archivedAt),
          gt(workspaceInvitation.expiresAt, new Date())
        )
      )
      .orderBy(desc(workspaceInvitation.createdAt));
  }

  async previewToken(token: string, actor: AuthenticatedUser) {
    const [row] = await this.db
      .select({
        id: workspaceInvitation.id,
        email: workspaceInvitation.email,
        role: workspaceInvitation.role,
        workspaceName: workspace.name,
        expiresAt: workspaceInvitation.expiresAt,
        acceptedAt: workspaceInvitation.acceptedAt,
        revokedAt: workspaceInvitation.revokedAt
      })
      .from(workspaceInvitation)
      .innerJoin(workspace, eq(workspace.id, workspaceInvitation.workspaceId))
      .where(eq(workspaceInvitation.tokenHash, hashToken(token)))
      .limit(1);
    if (!row || row.revokedAt || row.acceptedAt || row.expiresAt < new Date()) {
      throw new NotFoundException("This invitation is no longer valid");
    }
    return { id: row.id, workspaceName: row.workspaceName, role: row.role, forEmail: row.email, matchesAccount: row.email === actor.email.toLowerCase() };
  }

  async acceptById(invitationId: string, actor: AuthenticatedUser, ip?: string) {
    if (!actor.emailVerified) {
      throw new ForbiddenException("Verify your email address before accepting invitations");
    }
    return this.accept(eq(workspaceInvitation.id, invitationId), actor, ip);
  }

  /** A secret link that was emailed to the invited address also proves ownership of it. */
  async acceptByToken(token: string, actor: AuthenticatedUser, ip?: string) {
    return this.accept(eq(workspaceInvitation.tokenHash, hashToken(token)), actor, ip);
  }

  private async accept(match: ReturnType<typeof eq>, actor: AuthenticatedUser, ip?: string) {
    const result = await this.db.transaction(async (tx) => {
      const [invitation] = await tx.select().from(workspaceInvitation).where(match).limit(1).for("update");
      if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < new Date()) {
        throw new NotFoundException("This invitation is no longer valid");
      }
      if (invitation.email !== actor.email.toLowerCase()) {
        throw new ForbiddenException("This invitation was sent to a different email address");
      }
      const [existing] = await tx
        .select({ role: workspaceMember.role })
        .from(workspaceMember)
        .where(and(eq(workspaceMember.workspaceId, invitation.workspaceId), eq(workspaceMember.userId, actor.id)))
        .limit(1);
      if (!existing) {
        await tx.insert(workspaceMember).values({
          workspaceId: invitation.workspaceId,
          userId: actor.id,
          role: invitation.role,
          invitedBy: invitation.invitedBy
        });
      }
      await tx.update(workspaceInvitation).set({ acceptedAt: new Date() }).where(eq(workspaceInvitation.id, invitation.id));
      await this.audit.record({ type: "invitation.accepted", actorId: actor.id, workspaceId: invitation.workspaceId, ip }, tx);
      return { workspaceId: invitation.workspaceId, role: existing?.role ?? invitation.role };
    });
    await this.bus.publish({ type: "access.changed", workspaceId: result.workspaceId, userId: actor.id, role: result.role });
    return result;
  }

  /* ---------------- membership changes ---------------- */

  async updateMemberRole(workspaceId: string, actor: AuthenticatedUser, targetUserId: string, role: WorkspaceRole, ip?: string) {
    await this.access.requireWorkspace(workspaceId, actor.id, "member.manage");
    const updated = await this.db.transaction(async (tx) => {
      await this.lockOwners(tx, workspaceId);
      const [target] = await tx
        .select()
        .from(workspaceMember)
        .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, targetUserId)))
        .limit(1);
      if (!target) {
        throw new NotFoundException("Member not found");
      }
      if (target.role === "owner" && role !== "owner") {
        await this.assertAnotherOwner(tx, workspaceId, targetUserId);
      }
      const [row] = await tx
        .update(workspaceMember)
        .set({ role })
        .where(eq(workspaceMember.id, target.id))
        .returning();
      await this.audit.record(
        { type: "member.role_changed", actorId: actor.id, workspaceId, metadata: { userId: targetUserId, from: target.role, to: role }, ip },
        tx
      );
      return row!;
    });
    await this.bus.publish({ type: "access.changed", workspaceId, userId: targetUserId, role });
    return updated;
  }

  /** Members may always remove themselves; removing others needs `member.manage`. */
  async removeMember(workspaceId: string, actor: AuthenticatedUser, targetUserId: string, ip?: string) {
    if (actor.id === targetUserId) {
      await this.access.requireWorkspace(workspaceId, actor.id, "workspace.read");
    } else {
      await this.access.requireWorkspace(workspaceId, actor.id, "member.manage");
    }
    await this.db.transaction(async (tx) => {
      await this.lockOwners(tx, workspaceId);
      const [target] = await tx
        .select()
        .from(workspaceMember)
        .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, targetUserId)))
        .limit(1);
      if (!target) {
        throw new NotFoundException("Member not found");
      }
      if (target.role === "owner") {
        await this.assertAnotherOwner(tx, workspaceId, targetUserId);
      }
      await tx.delete(workspaceMember).where(eq(workspaceMember.id, target.id));
      await this.audit.record(
        { type: actor.id === targetUserId ? "member.left" : "member.removed", actorId: actor.id, workspaceId, metadata: { userId: targetUserId }, ip },
        tx
      );
    });
    await this.bus.publish({ type: "access.changed", workspaceId, userId: targetUserId, role: null });
  }

  /** Serialises concurrent owner changes so two owners can't demote each other at once. */
  private async lockOwners(tx: Pick<Db, "select">, workspaceId: string): Promise<void> {
    await tx
      .select({ id: workspaceMember.id })
      .from(workspaceMember)
      .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.role, "owner")))
      .for("update");
  }

  private async assertAnotherOwner(tx: Pick<Db, "select">, workspaceId: string, excludingUserId: string): Promise<void> {
    const [row] = await tx
      .select({ owners: count() })
      .from(workspaceMember)
      .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.role, "owner"), ne(workspaceMember.userId, excludingUserId)));
    if (!row || row.owners < 1) {
      throw new ConflictException("A workspace needs at least one owner. Make someone else an owner first.");
    }
  }
}
