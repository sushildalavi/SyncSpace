import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { DocumentsService } from "../src/documents/documents.service.js";
import * as t from "../src/db/schema.js";
import type { Db } from "../src/db/database.module.js";
import { migrateFromMongo, type LegacySource, type LegacyUpdate } from "../src/migration/mongo-migrator.js";
import { createServices, createTestDb } from "./helpers.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ada = id(1);
const grace = id(2);
const ws = id(10);
const docText = id(20);
const docRich = id(21);
const docEmpty = id(22);

function edit(doc: Y.Doc, fn: () => void): Uint8Array {
  let bytes: Uint8Array = new Uint8Array();
  const handler = (update: Uint8Array) => (bytes = update);
  doc.on("update", handler);
  fn();
  doc.off("update", handler);
  return bytes;
}

function buildSource(): { source: LegacySource; passwordHash: string } {
  const passwordHash = bcrypt.hashSync("legacy-password", 4);
  const text = new Y.Doc();
  const t1 = edit(text, () => text.getText("body").insert(0, "Line one\nLine two"));
  const t2 = edit(text, () => text.getText("body").insert(text.getText("body").length, "\nLine three"));
  const rich = new Y.Doc();
  const r1 = edit(rich, () => {
    const p = new Y.XmlElement("paragraph");
    p.insert(0, [new Y.XmlText("already rich")]);
    rich.getXmlFragment("default").push([p]);
  });
  // a legacy snapshot of the first update, with a nonsense client-chosen version
  const snap = Y.encodeStateAsUpdate((() => { const d = new Y.Doc(); Y.applyUpdate(d, t1); return d; })());
  const upd = (docId: string, n: number, bytes: Uint8Array, updateId = `u${n}`, actor = ada): LegacyUpdate => ({ _id: `m${docId}${n}`, documentId: docId, updateId, actorId: actor, clientId: "c", payload: Buffer.from(bytes), receivedAt: new Date(2024, 0, 1, 0, 0, n) });
  const source: LegacySource = {
    users: async () => [
      { _id: ada, email: "Ada@Example.com", passwordHash, displayName: "Ada" },
      { _id: grace, email: "grace@example.com", displayName: "Grace" },
      { _id: id(3), email: "ada@example.com", displayName: "Ada duplicate" },
      { _id: id(4), email: "not-an-email", displayName: "Broken" }
    ],
    workspaces: async () => [
      { _id: ws, name: "Acme", ownerId: ada },
      { _id: id(11), name: "Orphan", ownerId: "ghost" }
    ],
    memberships: async () => [
      { _id: id(30), workspaceId: ws, userId: ada, role: "owner" },
      { _id: id(31), workspaceId: ws, userId: grace, role: "editor", invitedBy: ada },
      { _id: id(32), workspaceId: ws, userId: "ghost", role: "viewer" },
      { _id: id(33), workspaceId: ws, userId: grace, role: "superuser" }
    ],
    integrations: async () => [{ _id: id(40), workspaceId: ws, provider: "slack", name: "Slack", webhookUrl: "https://hooks.slack.com/x", createdBy: ada, updatedBy: ada }],
    documents: async () => [
      { _id: docText, workspaceId: ws, title: "Plain text doc", createdBy: ada, updatedBy: grace },
      { _id: docRich, workspaceId: ws, title: "Rich doc", createdBy: ada, updatedBy: ada },
      { _id: docEmpty, workspaceId: ws, title: "Empty", createdBy: grace, updatedBy: grace },
      { _id: "not-a-uuid", workspaceId: ws, title: "Bad id", createdBy: ada, updatedBy: ada }
    ],
    snapshots: async (docId) => (docId === docText ? [{ _id: "s1", documentId: docId, version: 9999, stateBlob: Buffer.from(snap) }] : []),
    updates: async (docId) =>
      docId === docText
        ? [upd(docId, 2, t2), upd(docId, 1, t1), upd(docId, 3, t2, "u1"), upd(docId, 4, new Uint8Array([1, 2, 3]), "garbage")] // out of order, a duplicate id, a corrupt payload
        : docId === docRich
          ? [upd(docId, 1, r1, "r1", grace)]
          : []
  };
  return { source, passwordHash };
}

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

describe("MongoDB -> PostgreSQL migration", () => {
  it("dry run validates everything and writes nothing", async () => {
    const { source } = buildSource();
    const report = await migrateFromMongo(db, source, { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.counts.users!.migrated).toBe(2);
    expect(await db.select().from(t.user)).toHaveLength(0);
    expect(await db.select().from(t.document)).toHaveLength(0);
  });

  it("migrates, preserves ids and relationships, and reports bad data instead of hiding it", async () => {
    const { source, passwordHash } = buildSource();
    const report = await migrateFromMongo(db, source);

    expect(report.counts.users).toEqual({ source: 4, migrated: 2, skipped: 2 });
    expect(report.counts.workspaces).toEqual({ source: 2, migrated: 1, skipped: 1 });
    expect(report.counts.documents).toEqual({ source: 4, migrated: 3, skipped: 1 });
    expect(report.issues.join("\n")).toMatch(/duplicate email ada@example.com/);
    expect(report.issues.join("\n")).toMatch(/not a valid Yjs update/);
    expect(report.issues.join("\n")).toMatch(/duplicate updateId/);
    expect(report.issues.join("\n")).toMatch(/invalid role/);

    const [user] = await db.select().from(t.user).where(eq(t.user.id, ada));
    expect(user).toMatchObject({ id: ada, email: "ada@example.com" });
    const [credential] = await db.select().from(t.account).where(eq(t.account.userId, ada));
    expect(credential?.password).toBe(passwordHash); // legacy bcrypt hash carried over untouched
    const members = await db.select().from(t.workspaceMember).where(eq(t.workspaceMember.workspaceId, ws));
    expect(members.map((m) => m.role).sort()).toEqual(["editor", "owner"]);
  });

  it("assigns server versions in arrival order and reproduces the legacy document state", async () => {
    const rows = await db.select().from(t.documentUpdate).where(eq(t.documentUpdate.documentId, docText)).orderBy(t.documentUpdate.version);
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3]); // two valid updates + the rich-text conversion
    expect(rows.at(-1)?.updateId).toBe("migration-richtext-v1");

    const { ctx } = { ctx: createServices(db) };
    const documents = new DocumentsService(db, ctx.access, ctx.audit, ctx.bus);
    const loaded = await documents.loadState(docText);
    const rebuilt = new Y.Doc();
    Y.applyUpdate(rebuilt, loaded.update);
    expect(rebuilt.getText("body").toString()).toBe("Line one\nLine two\nLine three");
    const paragraphs = rebuilt.getXmlFragment("default").toArray().map((node) => node.toString());
    expect(paragraphs).toEqual(["<paragraph>Line one</paragraph>", "<paragraph>Line two</paragraph>", "<paragraph>Line three</paragraph>"]);
  });

  it("leaves documents that are already rich text alone and tolerates empty ones", async () => {
    const rich = await db.select().from(t.documentUpdate).where(eq(t.documentUpdate.documentId, docRich));
    expect(rich).toHaveLength(1);
    expect(rich[0]?.updateId).toBe("r1");
    expect(await db.select().from(t.documentUpdate).where(eq(t.documentUpdate.documentId, docEmpty))).toHaveLength(0);
  });

  it("is repeatable: a second run changes nothing and still verifies", async () => {
    const before = (await db.select().from(t.documentUpdate)).length;
    const { source } = buildSource();
    const report = await migrateFromMongo(db, source);
    expect((await db.select().from(t.documentUpdate)).length).toBe(before);
    expect(report.counts.users!.migrated).toBe(0);
    expect(report.verification.mismatches).toEqual([]);
    expect(report.verification.documentsEqual).toBe(report.verification.documentsChecked);
  });

  it("verification reports equal state for every migrated document", async () => {
    const { source } = buildSource();
    const report = await migrateFromMongo(db, source, { dryRun: true });
    expect(report.verification.documentsChecked).toBe(3);
    expect(report.verification.mismatches).toEqual([]);
    expect(report.verification.payloadChecksumSource).toBe(report.verification.payloadChecksumTarget);
  });
});
