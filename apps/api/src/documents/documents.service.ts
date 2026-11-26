import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, exists, gt, ilike, isNull, lte, notExists, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import * as Y from "yjs";
import { AccessService } from "../access/access.service.js";
import { AuditService } from "../audit/audit.service.js";
import { DB, type Db } from "../db/database.module.js";
import { document, documentFavorite, documentShare, documentSnapshot, documentUpdate, documentView, user, workspace, workspaceMember } from "../db/schema.js";
import { RealtimeBus, SERVER_CONNECTION } from "../realtime/realtimeBus.service.js";

/** Snapshot once this many updates have accumulated since the previous one. */
export const SNAPSHOT_EVERY = 50;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type PersistResult = { duplicate: boolean; version: number };

@Injectable()
export class DocumentsService {
  private readonly snapshotting = new Set<string>();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RealtimeBus) private readonly bus: Pick<RealtimeBus, "publish">
  ) {}

  async list(workspaceId: string, userId: string, query?: string) {
    await this.access.requireWorkspace(workspaceId, userId, "document.read");
    return this.db
      .select({
        id: document.id,
        workspaceId: document.workspaceId,
        title: document.title,
        updatedAt: document.updatedAt,
        createdAt: document.createdAt,
        isFavorite: sql<boolean>`${documentFavorite.userId} is not null`
      })
      .from(document)
      .leftJoin(documentFavorite, and(eq(documentFavorite.documentId, document.id), eq(documentFavorite.userId, userId)))
      .where(
        and(
          eq(document.workspaceId, workspaceId),
          isNull(document.deletedAt),
          query ? ilike(document.title, `%${escapeLike(query)}%`) : undefined
        )
      )
      .orderBy(desc(document.updatedAt));
  }

  async create(workspaceId: string, title: string, userId: string) {
    await this.access.requireWorkspace(workspaceId, userId, "document.create");
    const [created] = await this.db.insert(document).values({ workspaceId, title, createdBy: userId, updatedBy: userId }).returning();
    return created!;
  }

  async get(documentId: string, userId: string) {
    const { document: doc, role, permissions, workspaceRole } = await this.access.requireDocument(documentId, userId, "document.read");
    await this.db
      .insert(documentView)
      .values({ userId, documentId })
      .onConflictDoUpdate({ target: [documentView.userId, documentView.documentId], set: { viewedAt: new Date() } });
    const [favorite] = await this.db
      .select({ userId: documentFavorite.userId })
      .from(documentFavorite)
      .where(and(eq(documentFavorite.documentId, documentId), eq(documentFavorite.userId, userId)))
      .limit(1);
    // workspaceRole is null for someone who only has a share, so the app hides workspace controls from them.
    return { ...doc, role, permissions, workspaceRole, isFavorite: Boolean(favorite) };
  }

  async rename(documentId: string, title: string, userId: string) {
    await this.access.requireDocument(documentId, userId, "document.write");
    const [row] = await this.db.update(document).set({ title, updatedBy: userId }).where(eq(document.id, documentId)).returning();
    return row!;
  }

  async remove(documentId: string, userId: string) {
    const { document: doc } = await this.access.requireDocument(documentId, userId, "document.delete");
    await this.db.update(document).set({ deletedAt: new Date() }).where(eq(document.id, documentId));
    await this.audit.record({ type: "document.deleted", actorId: userId, workspaceId: doc.workspaceId, metadata: { documentId } });
    await this.bus.publish({ type: "document.deleted", documentId });
  }

  async setFavorite(documentId: string, userId: string, favorite: boolean) {
    await this.access.requireDocument(documentId, userId, "document.read");
    if (favorite) {
      await this.db.insert(documentFavorite).values({ userId, documentId }).onConflictDoNothing();
    } else {
      await this.db.delete(documentFavorite).where(and(eq(documentFavorite.userId, userId), eq(documentFavorite.documentId, documentId)));
    }
    return { isFavorite: favorite };
  }

  private isMember(userId: string) {
    return this.db
      .select({ one: sql`1` })
      .from(workspaceMember)
      .where(and(eq(workspaceMember.workspaceId, document.workspaceId), eq(workspaceMember.userId, userId)));
  }

  private hasShare(userId: string) {
    return this.db
      .select({ one: sql`1` })
      .from(documentShare)
      .innerJoin(user, eq(user.id, userId))
      .where(
        and(
          eq(documentShare.documentId, document.id),
          or(eq(documentShare.userId, userId), and(isNull(documentShare.userId), eq(documentShare.email, user.email), eq(user.emailVerified, true)))
        )
      );
  }

  /** SQL condition: a live document this user may read. The same rule AccessService applies to one document. */
  private readableBy(userId: string) {
    return and(isNull(document.deletedAt), isNull(workspace.archivedAt), or(exists(this.isMember(userId)), exists(this.hasShare(userId))));
  }

  private links(userId: string) {
    return this.db
      .select({
        id: document.id,
        workspaceId: document.workspaceId,
        workspaceName: workspace.name,
        title: document.title,
        updatedAt: document.updatedAt
      })
      .from(document)
      .innerJoin(workspace, eq(workspace.id, document.workspaceId))
      .$dynamic()
      .where(this.readableBy(userId));
  }

  async recent(userId: string, limit = 8) {
    return this.db
      .select({
        id: document.id,
        workspaceId: document.workspaceId,
        workspaceName: workspace.name,
        title: document.title,
        viewedAt: documentView.viewedAt
      })
      .from(documentView)
      .innerJoin(document, eq(document.id, documentView.documentId))
      .innerJoin(workspace, eq(workspace.id, document.workspaceId))
      .where(and(eq(documentView.userId, userId), this.readableBy(userId)))
      .orderBy(desc(documentView.viewedAt))
      .limit(limit);
  }

  async favorites(userId: string) {
    return this.db
      .select({
        id: document.id,
        workspaceId: document.workspaceId,
        workspaceName: workspace.name,
        title: document.title,
        updatedAt: document.updatedAt
      })
      .from(documentFavorite)
      .innerJoin(document, eq(document.id, documentFavorite.documentId))
      .innerJoin(workspace, eq(workspace.id, document.workspaceId))
      .where(and(eq(documentFavorite.userId, userId), this.readableBy(userId)))
      .orderBy(desc(documentFavorite.createdAt));
  }

  /** Documents shared directly with this user from workspaces they don't belong to. */
  async sharedWithMe(userId: string) {
    return this.db
      .select({
        id: document.id,
        workspaceId: document.workspaceId,
        workspaceName: workspace.name,
        title: document.title,
        updatedAt: document.updatedAt
      })
      .from(document)
      .innerJoin(workspace, eq(workspace.id, document.workspaceId))
      .where(and(isNull(document.deletedAt), isNull(workspace.archivedAt), exists(this.hasShare(userId)), notExists(this.isMember(userId))))
      .orderBy(desc(document.updatedAt));
  }

  async search(userId: string, query: string, limit = 20) {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    return this.db
      .select({
        id: document.id,
        workspaceId: document.workspaceId,
        workspaceName: workspace.name,
        title: document.title,
        updatedAt: document.updatedAt
      })
      .from(document)
      .innerJoin(workspace, eq(workspace.id, document.workspaceId))
      .where(and(this.readableBy(userId), ilike(document.title, `%${escapeLike(trimmed)}%`)))
      .orderBy(desc(document.updatedAt))
      .limit(limit);
  }

  /* ---------------- history ---------------- */

  async history(documentId: string, userId: string) {
    const { document: doc } = await this.access.requireDocument(documentId, userId, "document.read");
    const updates = await this.db
      .select({
        version: documentUpdate.version,
        actorId: documentUpdate.actorId,
        actorName: user.name,
        createdAt: documentUpdate.createdAt
      })
      .from(documentUpdate)
      .innerJoin(user, eq(user.id, documentUpdate.actorId))
      .where(eq(documentUpdate.documentId, documentId))
      .orderBy(desc(documentUpdate.version))
      .limit(200);
    const snapshots = await this.db
      .select({
        version: documentSnapshot.version,
        byteSize: documentSnapshot.byteSize,
        updatesSincePrevious: documentSnapshot.updatesSincePrevious,
        createdAt: documentSnapshot.createdAt
      })
      .from(documentSnapshot)
      .where(eq(documentSnapshot.documentId, documentId))
      .orderBy(desc(documentSnapshot.version));
    return { currentVersion: doc.currentVersion, snapshots, updates };
  }

  async stateAt(documentId: string, userId: string, version: number) {
    await this.access.requireDocument(documentId, userId, "document.read");
    const state = await this.loadState(documentId, version);
    return { version: state.version, state: Buffer.from(state.update).toString("base64") };
  }

  /**
   * Makes the document read as it did after `version`, as a NEW update on top of the current state. History is never
   * rewritten, so a restore can itself be undone by restoring a later version, and anyone typing concurrently keeps
   * their newer edits (Yjs merges the replacement with them).
   */
  async restore(documentId: string, version: number, userId: string): Promise<{ restoredFrom: number; version: number; unchanged: boolean }> {
    const { document: doc } = await this.access.requireDocument(documentId, userId, "document.write");
    if (!Number.isInteger(version) || version < 1 || version > doc.currentVersion) {
      throw new NotFoundException("Version not found");
    }
    const current = await this.loadState(documentId);
    const target = await this.loadState(documentId, version);

    const live = new Y.Doc();
    Y.applyUpdate(live, current.update);
    const past = new Y.Doc();
    Y.applyUpdate(past, target.update);

    // Rewriting identical content would still mint a new CRDT update, so compare first.
    if (live.getXmlFragment("default").toString() === past.getXmlFragment("default").toString()) {
      return { restoredFrom: version, version: current.version, unchanged: true };
    }

    let captured: Uint8Array | null = null;
    live.on("update", (update: Uint8Array) => {
      captured = captured ? Y.mergeUpdates([captured, update]) : update;
    });
    live.transact(() => {
      const fragment = live.getXmlFragment("default");
      fragment.delete(0, fragment.length);
      fragment.insert(0, past.getXmlFragment("default").toArray().map((node) => node.clone() as Y.XmlElement | Y.XmlText));
    });
    if (!captured) {
      return { restoredFrom: version, version: current.version, unchanged: true };
    }

    const payload: Uint8Array = captured;
    const updateId = `restore-${randomUUID()}`;
    const saved = await this.persistUpdate({ documentId, actorId: userId, clientId: "restore", updateId, payload, sourceInstanceId: "api" });
    await this.audit.record({ type: "document.restored", actorId: userId, workspaceId: doc.workspaceId, metadata: { documentId, restoredFrom: version, newVersion: saved.version } });
    await this.bus.publish({ type: "document.update", documentId, connectionId: SERVER_CONNECTION, updateId, version: saved.version, payload: Buffer.from(payload).toString("base64"), actorId: userId });
    void this.snapshotIfNeeded(documentId).catch(() => undefined);
    return { restoredFrom: version, version: saved.version, unchanged: false };
  }

  /* ---------------- collaboration persistence ---------------- */

  /**
   * Latest snapshot at or below `upTo`, plus only the updates after it. Bounded by SNAPSHOT_EVERY
   * in normal operation, so loading never replays the full history.
   */
  async loadState(documentId: string, upTo?: number): Promise<{ update: Uint8Array; version: number }> {
    const [snapshot] = await this.db
      .select({ version: documentSnapshot.version, state: documentSnapshot.state })
      .from(documentSnapshot)
      .where(and(eq(documentSnapshot.documentId, documentId), upTo === undefined ? undefined : lte(documentSnapshot.version, upTo)))
      .orderBy(desc(documentSnapshot.version))
      .limit(1);
    const base = snapshot?.version ?? 0;
    const rows = await this.db
      .select({ version: documentUpdate.version, payload: documentUpdate.payload })
      .from(documentUpdate)
      .where(
        and(
          eq(documentUpdate.documentId, documentId),
          gt(documentUpdate.version, base),
          upTo === undefined ? undefined : lte(documentUpdate.version, upTo)
        )
      )
      .orderBy(asc(documentUpdate.version));
    const parts: Uint8Array[] = [];
    if (snapshot) {
      parts.push(new Uint8Array(snapshot.state));
    }
    for (const row of rows) {
      parts.push(new Uint8Array(row.payload));
    }
    const update = parts.length > 0 ? Y.mergeUpdates(parts) : Y.encodeStateAsUpdate(new Y.Doc());
    return { update, version: rows.at(-1)?.version ?? base };
  }

  /**
   * Appends one incremental update. The version is assigned here, inside the transaction, from
   * the document row counter, so clients can never choose or skip a version number.
   */
  async persistUpdate(params: {
    documentId: string;
    actorId: string;
    clientId: string;
    updateId: string;
    payload: Uint8Array;
    sourceInstanceId: string;
  }): Promise<PersistResult> {
    const existing = await this.findByUpdateId(params.documentId, params.updateId);
    if (existing) {
      return { duplicate: true, version: existing };
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [bumped] = await tx
          .update(document)
          .set({ currentVersion: sql`${document.currentVersion} + 1`, updatedBy: params.actorId, updatedAt: new Date() })
          .where(and(eq(document.id, params.documentId), isNull(document.deletedAt)))
          .returning({ version: document.currentVersion });
        if (!bumped) {
          throw new NotFoundException("Document not found");
        }
        await tx.insert(documentUpdate).values({
          documentId: params.documentId,
          version: bumped.version,
          updateId: params.updateId,
          actorId: params.actorId,
          clientId: params.clientId,
          payload: Buffer.from(params.payload),
          payloadHash: createHash("sha256").update(params.payload).digest("hex"),
          sourceInstanceId: params.sourceInstanceId
        });
        return { duplicate: false, version: bumped.version };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const version = await this.findByUpdateId(params.documentId, params.updateId);
        if (version) {
          return { duplicate: true, version };
        }
      }
      throw error;
    }
  }

  private async findByUpdateId(documentId: string, updateId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ version: documentUpdate.version })
      .from(documentUpdate)
      .where(and(eq(documentUpdate.documentId, documentId), eq(documentUpdate.updateId, updateId)))
      .limit(1);
    return row?.version ?? null;
  }

  /**
   * Writes a snapshot once SNAPSHOT_EVERY updates have accumulated. The check reads two integers
   * from the document row. It does not count or scan the update log.
   */
  async snapshotIfNeeded(documentId: string): Promise<boolean> {
    if (this.snapshotting.has(documentId)) {
      return false;
    }
    const [doc] = await this.db
      .select({ currentVersion: document.currentVersion, snapshotVersion: document.snapshotVersion })
      .from(document)
      .where(eq(document.id, documentId))
      .limit(1);
    if (!doc || doc.currentVersion - doc.snapshotVersion < SNAPSHOT_EVERY) {
      return false;
    }
    this.snapshotting.add(documentId);
    try {
      const state = await this.loadState(documentId, doc.currentVersion);
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, state.update);
      const compact = Y.encodeStateAsUpdate(ydoc);
      await this.db.transaction(async (tx) => {
        await tx
          .insert(documentSnapshot)
          .values({
            documentId,
            version: state.version,
            state: Buffer.from(compact),
            byteSize: compact.byteLength,
            updatesSincePrevious: state.version - doc.snapshotVersion
          })
          .onConflictDoNothing();
        await tx
          .update(document)
          .set({ snapshotVersion: state.version })
          .where(and(eq(document.id, documentId), lte(document.snapshotVersion, state.version)));
      });
      return true;
    } finally {
      this.snapshotting.delete(documentId);
    }
  }
}

export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (typeof current === "object" && "code" in current && (current as { code?: string }).code === "23505") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
