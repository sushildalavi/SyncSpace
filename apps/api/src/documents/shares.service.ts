import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { ShareRole } from "@syncspace/contracts";
import { AccessService, isUuid } from "../access/access.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedUser } from "../auth/session.guard.js";
import { DB, type Db } from "../db/database.module.js";
import { documentShare, user } from "../db/schema.js";
import { MailerService } from "../mail/mailer.service.js";
import { actionEmail } from "../mail/templates.js";
import { RealtimeBus } from "../realtime/realtimeBus.service.js";
import { APP_ENV, type AppEnv } from "../common/appEnv.js";

@Injectable()
export class SharesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RealtimeBus) private readonly bus: Pick<RealtimeBus, "publish">,
    @Inject(MailerService) private readonly mailer: Pick<MailerService, "send">,
    @Inject(APP_ENV) private readonly env: Pick<AppEnv, "WEB_ORIGIN">
  ) {}

  /** Deliberately returns only what the owner typed, never whether an account exists for that address. */
  async list(documentId: string, userId: string) {
    await this.access.requireDocument(documentId, userId, "document.share");
    return this.db
      .select({ id: documentShare.id, email: documentShare.email, role: documentShare.role, createdAt: documentShare.createdAt })
      .from(documentShare)
      .where(eq(documentShare.documentId, documentId))
      .orderBy(asc(documentShare.createdAt));
  }

  /** Creates a share, or changes the role of an existing one. */
  async share(documentId: string, actor: AuthenticatedUser, email: string, role: ShareRole, ip?: string) {
    const { document } = await this.access.requireDocument(documentId, actor.id, "document.share");
    const normalized = email.toLowerCase();
    if (normalized === actor.email.toLowerCase()) {
      throw new BadRequestException("You already have access to this document");
    }
    const [owner] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.email, normalized), eq(user.emailVerified, true)))
      .limit(1);
    const [previous] = await this.db
      .select({ role: documentShare.role })
      .from(documentShare)
      .where(and(eq(documentShare.documentId, documentId), eq(documentShare.email, normalized)))
      .limit(1);
    const [row] = await this.db
      .insert(documentShare)
      .values({ documentId, email: normalized, role, userId: owner?.id ?? null, sharedBy: actor.id })
      .onConflictDoUpdate({ target: [documentShare.documentId, documentShare.email], set: { role, updatedAt: new Date() } })
      .returning();
    await this.audit.record({ type: "document.shared", actorId: actor.id, workspaceId: document.workspaceId, metadata: { documentId, email: normalized, role }, ip });

    if (row!.userId) {
      await this.bus.publish({ type: "access.changed", workspaceId: document.workspaceId, userId: row!.userId, role });
    }
    // A role change is visible in the open document; only a new share needs an email.
    if (!previous) {
      const mail = actionEmail({
        heading: `${actor.name} shared "${document.title}" with you`,
        body: `You can ${role === "editor" ? "view and edit" : "view"} this document. Sign in or create an account with this email address, and confirm it.`,
        actionLabel: "Open document",
        url: `${this.env.WEB_ORIGIN}/d/${documentId}`
      });
      await this.mailer.send({ to: normalized, subject: `Shared with you: ${document.title}`, ...mail });
    }
    return { id: row!.id, email: row!.email, role: row!.role, createdAt: row!.createdAt };
  }

  async remove(documentId: string, shareId: string, actorId: string) {
    const { document } = await this.access.requireDocument(documentId, actorId, "document.share");
    if (!isUuid(shareId)) {
      throw new NotFoundException("Share not found");
    }
    const [removed] = await this.db
      .delete(documentShare)
      .where(and(eq(documentShare.id, shareId), eq(documentShare.documentId, documentId)))
      .returning();
    if (!removed) {
      throw new NotFoundException("Share not found");
    }
    await this.audit.record({ type: "document.unshared", actorId, workspaceId: document.workspaceId, metadata: { documentId, email: removed.email } });
    if (removed.userId) {
      await this.bus.publish({ type: "access.changed", workspaceId: document.workspaceId, userId: removed.userId, role: null });
    }
  }
}
