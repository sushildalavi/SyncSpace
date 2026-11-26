import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull, or } from "drizzle-orm";
import { documentAccess, roleCan, type Permission, type ShareRole, type WorkspaceRole } from "@syncspace/contracts";
import { DB, type Db } from "../db/database.module.js";
import { document, documentShare, user, workspace, workspaceMember } from "../db/schema.js";

/**
 * Central authorization. Every HTTP route and every WebSocket message asks this service,
 * and it consults the shared permission rules in @syncspace/contracts.
 * People without access get 404 so workspace and document ids can't be probed.
 */
@Injectable()
export class AccessService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    if (!isUuid(workspaceId)) {
      return null;
    }
    const [row] = await this.db
      .select({ role: workspaceMember.role })
      .from(workspaceMember)
      .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
      .where(
        and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId), isNull(workspace.archivedAt))
      )
      .limit(1);
    return row?.role ?? null;
  }

  async requireWorkspace(workspaceId: string, userId: string, permission: Permission): Promise<WorkspaceRole> {
    const role = await this.getRole(workspaceId, userId);
    if (!role) {
      throw new NotFoundException("Workspace not found");
    }
    if (!roleCan(role, permission)) {
      throw new ForbiddenException("You don't have permission to do that in this workspace");
    }
    return role;
  }

  /** The strongest direct share the user holds on a document, if any. */
  private async getShareRole(documentId: string, userId: string): Promise<ShareRole | null> {
    const rows = await this.db
      .select({ role: documentShare.role })
      .from(documentShare)
      .innerJoin(user, eq(user.id, userId))
      .where(
        and(
          eq(documentShare.documentId, documentId),
          or(
            eq(documentShare.userId, userId),
            // Not yet bound to anyone: it counts only for a verified owner of that address.
            and(isNull(documentShare.userId), eq(documentShare.email, user.email), eq(user.emailVerified, true))
          )
        )
      );
    return rows.some((row) => row.role === "editor") ? "editor" : (rows[0]?.role ?? null);
  }

  /** What a user may do with one document, through workspace membership, a direct share, or both. */
  async getDocumentAccess(documentId: string, userId: string) {
    if (!isUuid(documentId)) {
      return null;
    }
    const [row] = await this.db
      .select({ document })
      .from(document)
      .innerJoin(workspace, and(eq(workspace.id, document.workspaceId), isNull(workspace.archivedAt)))
      .where(and(eq(document.id, documentId), isNull(document.deletedAt)))
      .limit(1);
    if (!row) {
      return null;
    }
    const workspaceRole = await this.getRole(row.document.workspaceId, userId);
    const access = documentAccess(workspaceRole, await this.getShareRole(documentId, userId));
    return access ? { document: row.document, workspaceRole, ...access } : null;
  }

  async requireDocument(documentId: string, userId: string, permission: Permission) {
    const access = await this.getDocumentAccess(documentId, userId);
    if (!access) {
      throw new NotFoundException("Document not found");
    }
    if (!access.permissions.includes(permission)) {
      throw new ForbiddenException("You don't have permission to do that with this document");
    }
    return access;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
