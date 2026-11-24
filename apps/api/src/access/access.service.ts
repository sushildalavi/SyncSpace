import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { roleCan, type Permission, type WorkspaceRole } from "@syncspace/contracts";
import { DB, type Db } from "../db/database.module.js";
import { document, workspace, workspaceMember } from "../db/schema.js";

/**
 * Central authorization. Every HTTP route and every WebSocket message asks this service,
 * and it consults the shared permission matrix in @syncspace/contracts.
 * Non-members get 404 so workspace and document ids can't be probed.
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

  /** Resolves a document and checks the caller's permission on its workspace. */
  async requireDocument(documentId: string, userId: string, permission: Permission) {
    if (!isUuid(documentId)) {
      throw new NotFoundException("Document not found");
    }
    const [doc] = await this.db
      .select()
      .from(document)
      .where(and(eq(document.id, documentId), isNull(document.deletedAt)))
      .limit(1);
    if (!doc) {
      throw new NotFoundException("Document not found");
    }
    const role = await this.getRole(doc.workspaceId, userId);
    if (!role) {
      throw new NotFoundException("Document not found");
    }
    if (!roleCan(role, permission)) {
      throw new ForbiddenException("You don't have permission to do that with this document");
    }
    return { document: doc, role };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
