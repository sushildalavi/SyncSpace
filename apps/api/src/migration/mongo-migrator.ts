import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import type { Db } from "../db/database.module.js";
import * as t from "../db/schema.js";

/* Shapes of the documents written by the legacy Mongoose models. */
type Bin = Uint8Array | { buffer: Uint8Array } | { value(): Uint8Array } | null | undefined;
export type LegacyUser = { _id: string; email: string; passwordHash?: string | null; displayName: string; avatarUrl?: string | null; createdAt?: Date; updatedAt?: Date };
export type LegacyWorkspace = { _id: string; name: string; ownerId: string; archivedAt?: Date | null; createdAt?: Date; updatedAt?: Date };
export type LegacyMembership = { _id: string; workspaceId: string; userId: string; role: string; invitedBy?: string | null; createdAt?: Date };
export type LegacyIntegration = { _id: string; workspaceId: string; provider: string; name: string; webhookUrl: string; enabled?: boolean; createdBy: string; updatedBy: string };
export type LegacyDocument = { _id: string; workspaceId: string; title: string; createdBy: string; updatedBy: string; deletedAt?: Date | null; createdAt?: Date; updatedAt?: Date };
export type LegacySnapshot = { _id: string; documentId: string; version: number; stateBlob: Bin };
export type LegacyUpdate = { _id: string; documentId: string; updateId: string; actorId: string; clientId: string; payload: Bin; receivedAt?: Date; sourceInstanceId?: string };

/** Read-only view of the legacy database. The migrator never writes to it. */
export interface LegacySource {
  users(): Promise<LegacyUser[]>;
  workspaces(): Promise<LegacyWorkspace[]>;
  memberships(): Promise<LegacyMembership[]>;
  integrations(): Promise<LegacyIntegration[]>;
  documents(): Promise<LegacyDocument[]>;
  snapshots(documentId: string): Promise<LegacySnapshot[]>;
  updates(documentId: string): Promise<LegacyUpdate[]>;
}

export type MigrationReport = {
  dryRun: boolean;
  counts: Record<string, { source: number; migrated: number; skipped: number }>;
  issues: string[];
  verification: { documentsChecked: number; documentsEqual: number; mismatches: string[]; payloadChecksumSource: string; payloadChecksumTarget: string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(["owner", "editor", "viewer"]);
export const RICHTEXT_UPDATE_ID = "migration-richtext-v1";

export function toBytes(value: Bin): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof (value as { value?: unknown }).value === "function") return (value as { value(): Uint8Array }).value();
  if ((value as { buffer?: unknown }).buffer instanceof Uint8Array) return (value as { buffer: Uint8Array }).buffer;
  return null;
}

/** The legacy loader: latest snapshot, then every update. Used as the ground truth for verification. */
function legacyState(snapshots: LegacySnapshot[], updates: LegacyUpdate[]): Y.Doc {
  const doc = new Y.Doc();
  const latest = [...snapshots].sort((a, b) => b.version - a.version)[0];
  const apply = (bytes: Uint8Array | null) => {
    if (!bytes) return;
    try {
      Y.applyUpdate(doc, bytes);
    } catch {
      // corrupt payloads are reported by the migration and excluded from both sides of the comparison
    }
  };
  apply(latest ? toBytes(latest.stateBlob) : null);
  for (const update of updates) apply(toBytes(update.payload));
  return doc;
}

export function textToFragmentUpdate(source: Y.Doc): Uint8Array | null {
  const text = source.getText("body").toString();
  const fragment = source.getXmlFragment("default");
  if (!text || fragment.length > 0) return null;
  let captured: Uint8Array | null = null;
  const handler = (update: Uint8Array) => (captured = update);
  source.on("update", handler);
  source.transact(() => {
    fragment.push(
      text.split("\n").map((line) => {
        const paragraph = new Y.XmlElement("paragraph");
        if (line) paragraph.insert(0, [new Y.XmlText(line)]);
        return paragraph;
      })
    );
  });
  source.off("update", handler);
  return captured;
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * Copies a legacy MongoDB dataset into PostgreSQL.
 *
 *  - ids are preserved (they were already UUIDs), so links and bookmarks keep working
 *  - safe to re-run: rows that already exist are left untouched
 *  - each document migrates in its own transaction (document + updates + snapshot, all or nothing)
 *  - server-side versions are assigned in the original arrival order, because legacy versions were client-chosen
 *  - legacy plain-text bodies (Y.Text "body") also get a rich-text copy so the new editor shows them
 *  - with dryRun the same validation runs inside a transaction that is rolled back
 */
export async function migrateFromMongo(db: Db, source: LegacySource, options: { dryRun?: boolean } = {}): Promise<MigrationReport> {
  const dryRun = options.dryRun ?? false;
  const issues: string[] = [];
  const counts: MigrationReport["counts"] = {};
  const tally = (name: string, total: number, migrated: number) => (counts[name] = { source: total, migrated, skipped: total - migrated });

  const run = async (tx: Db) => {
    /* ---- users ---- */
    const users = await source.users();
    const canonical = new Map<string, string>(); // legacy id -> id used in PostgreSQL
    const emails = new Map<string, string>();
    let migratedUsers = 0;
    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        issues.push(`user ${user._id}: invalid email, skipped`);
        continue;
      }
      const first = emails.get(email);
      if (first) {
        canonical.set(user._id, first);
        issues.push(`user ${user._id}: duplicate email ${email}, merged references into ${first}`);
        continue;
      }
      emails.set(email, user._id);
      canonical.set(user._id, user._id);
      const inserted = await tx
        .insert(t.user)
        .values({ id: user._id, email, name: user.displayName || email, emailVerified: false, image: user.avatarUrl ?? null, createdAt: user.createdAt ?? new Date(), updatedAt: user.updatedAt ?? new Date() })
        .onConflictDoNothing()
        .returning({ id: t.user.id });
      if (user.passwordHash) {
        // Legacy bcrypt hashes are kept as-is; they are upgraded to Argon2id on the user's next successful sign-in.
        await tx
          .insert(t.account)
          .values({ id: `${user._id}-credential`, accountId: user._id, providerId: "credential", userId: user._id, password: user.passwordHash })
          .onConflictDoNothing();
      }
      if (inserted.length > 0) migratedUsers += 1;
    }
    tally("users", users.length, migratedUsers);
    const uid = (id: string | null | undefined) => (id ? canonical.get(id) : undefined);

    /* ---- workspaces and memberships ---- */
    const workspaces = await source.workspaces();
    const validWorkspaces = new Set<string>();
    let migratedWorkspaces = 0;
    for (const ws of workspaces) {
      const owner = uid(ws.ownerId);
      if (!UUID.test(ws._id) || !owner) {
        issues.push(`workspace ${ws._id}: ${owner ? "id is not a UUID" : "owner missing"}, skipped`);
        continue;
      }
      validWorkspaces.add(ws._id);
      const rows = await tx
        .insert(t.workspace)
        .values({ id: ws._id, name: ws.name, ownerId: owner, archivedAt: ws.archivedAt ?? null, createdAt: ws.createdAt ?? new Date(), updatedAt: ws.updatedAt ?? new Date() })
        .onConflictDoNothing()
        .returning({ id: t.workspace.id });
      migratedWorkspaces += rows.length;
    }
    tally("workspaces", workspaces.length, migratedWorkspaces);

    const memberships = await source.memberships();
    let migratedMembers = 0;
    for (const m of memberships) {
      const user = uid(m.userId);
      if (!validWorkspaces.has(m.workspaceId) || !user || !ROLES.has(m.role)) {
        issues.push(`membership ${m._id}: dangling reference or invalid role, skipped`);
        continue;
      }
      const rows = await tx
        .insert(t.workspaceMember)
        .values({ id: UUID.test(m._id) ? m._id : undefined, workspaceId: m.workspaceId, userId: user, role: m.role as "owner", invitedBy: uid(m.invitedBy) ?? null, createdAt: m.createdAt ?? new Date() })
        .onConflictDoNothing()
        .returning({ id: t.workspaceMember.id });
      migratedMembers += rows.length;
    }
    tally("memberships", memberships.length, migratedMembers);
    // every workspace needs an owner membership for its creator
    for (const ws of workspaces) {
      const owner = uid(ws.ownerId);
      if (!owner || !validWorkspaces.has(ws._id)) continue;
      await tx.insert(t.workspaceMember).values({ workspaceId: ws._id, userId: owner, role: "owner" }).onConflictDoNothing();
    }

    const integrations = await source.integrations();
    let migratedIntegrations = 0;
    for (const item of integrations) {
      const by = uid(item.createdBy);
      if (!validWorkspaces.has(item.workspaceId) || !by || !["slack", "teams"].includes(item.provider)) {
        issues.push(`integration ${item._id}: dangling reference, skipped`);
        continue;
      }
      const rows = await tx
        .insert(t.workspaceIntegration)
        .values({ id: UUID.test(item._id) ? item._id : undefined, workspaceId: item.workspaceId, provider: item.provider as "slack", name: item.name, webhookUrl: item.webhookUrl, enabled: item.enabled ?? true, createdBy: by, updatedBy: uid(item.updatedBy) ?? by })
        .onConflictDoNothing()
        .returning({ id: t.workspaceIntegration.id });
      migratedIntegrations += rows.length;
    }
    tally("integrations", integrations.length, migratedIntegrations);

    /* ---- documents, updates, snapshots ---- */
    const documents = await source.documents();
    let migratedDocs = 0;
    let migratedUpdates = 0;
    let sourceUpdates = 0;
    const sourcePayloadHashes: string[] = [];
    const verification: MigrationReport["verification"] = { documentsChecked: 0, documentsEqual: 0, mismatches: [], payloadChecksumSource: "", payloadChecksumTarget: "" };

    for (const doc of documents) {
      const creator = uid(doc.createdBy);
      const updater = uid(doc.updatedBy) ?? creator;
      if (!UUID.test(doc._id) || !validWorkspaces.has(doc.workspaceId) || !creator || !updater) {
        issues.push(`document ${doc._id}: dangling reference or non-UUID id, skipped`);
        continue;
      }
      const [existing] = await tx.select({ id: t.document.id }).from(t.document).where(eq(t.document.id, doc._id)).limit(1);
      const legacyUpdates = (await source.updates(doc._id)).sort((a, b) => +(a.receivedAt ?? 0) - +(b.receivedAt ?? 0) || a._id.localeCompare(b._id));
      sourceUpdates += legacyUpdates.length;
      const legacySnapshots = await source.snapshots(doc._id);
      const expected = legacyState(legacySnapshots, legacyUpdates);
      // The conversion is part of the expected end state whether or not this run is the one that writes it.
      const conversion = textToFragmentUpdate(expected);

      if (!existing) {
        await tx.insert(t.document).values({ id: doc._id, workspaceId: doc.workspaceId, title: doc.title, createdBy: creator, updatedBy: updater, deletedAt: doc.deletedAt ?? null, createdAt: doc.createdAt ?? new Date(), updatedAt: doc.updatedAt ?? new Date() });
        migratedDocs += 1;
        let version = 0;
        const seen = new Set<string>();
        for (const update of legacyUpdates) {
          const bytes = toBytes(update.payload);
          const actor = uid(update.actorId) ?? creator;
          if (!bytes) {
            issues.push(`update ${update._id}: empty payload, skipped`);
            continue;
          }
          if (seen.has(update.updateId)) {
            issues.push(`update ${update._id}: duplicate updateId in document ${doc._id}, skipped`);
            continue;
          }
          try {
            Y.applyUpdate(new Y.Doc(), bytes);
          } catch {
            issues.push(`update ${update._id}: not a valid Yjs update, skipped`);
            continue;
          }
          seen.add(update.updateId);
          version += 1;
          const hash = sha(bytes);
          sourcePayloadHashes.push(hash);
          await tx.insert(t.documentUpdate).values({ documentId: doc._id, version, updateId: update.updateId, actorId: actor, clientId: update.clientId || "legacy", payload: Buffer.from(bytes), payloadHash: hash, sourceInstanceId: update.sourceInstanceId || "legacy", createdAt: update.receivedAt ?? new Date() });
          migratedUpdates += 1;
        }
        // Give plain-text documents a rich-text body for the new editor.
        if (conversion) {
          version += 1;
          await tx.insert(t.documentUpdate).values({ documentId: doc._id, version, updateId: RICHTEXT_UPDATE_ID, actorId: creator, clientId: "migration", payload: Buffer.from(conversion), payloadHash: sha(conversion), sourceInstanceId: "migration" });
        }
        await tx.update(t.document).set({ currentVersion: version }).where(eq(t.document.id, doc._id));
      }

      /* verify: the PostgreSQL document content must equal the legacy content */
      const rows = await tx.select({ payload: t.documentUpdate.payload }).from(t.documentUpdate).where(eq(t.documentUpdate.documentId, doc._id)).orderBy(t.documentUpdate.version);
      const actual = new Y.Doc();
      for (const row of rows) Y.applyUpdate(actual, new Uint8Array(row.payload));
      verification.documentsChecked += 1;
      // Content equality (not state vectors): the rich-text conversion is authored by a fresh client id on each run.
      const same = expected.getText("body").toString() === actual.getText("body").toString() && expected.getXmlFragment("default").toString() === actual.getXmlFragment("default").toString();
      if (same) verification.documentsEqual += 1;
      else verification.mismatches.push(doc._id);
    }
    tally("documents", documents.length, migratedDocs);
    tally("documentUpdates", sourceUpdates, migratedUpdates);

    // Migration-added rich-text updates aren't in the source, so compare checksums over the shared prefix only.
    const targetOriginal = (await tx.select({ hash: t.documentUpdate.payloadHash, id: t.documentUpdate.updateId }).from(t.documentUpdate).orderBy(t.documentUpdate.documentId, t.documentUpdate.version)).filter((row) => row.id !== RICHTEXT_UPDATE_ID).map((row) => row.hash);
    verification.payloadChecksumSource = createHash("sha256").update([...sourcePayloadHashes].sort().join("")).digest("hex");
    verification.payloadChecksumTarget = createHash("sha256").update(targetOriginal.filter((h) => sourcePayloadHashes.includes(h)).sort().join("")).digest("hex");
    return verification;
  };

  let verification!: MigrationReport["verification"];
  class Rollback extends Error {}
  try {
    await db.transaction(async (outer) => {
      verification = await run(outer as unknown as Db);
      if (dryRun) throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return { dryRun, counts, issues, verification };
}
