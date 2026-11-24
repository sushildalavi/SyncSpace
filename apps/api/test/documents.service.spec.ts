import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { eq } from "drizzle-orm";
import { document, documentSnapshot } from "../src/db/schema.js";
import { DocumentsService, SNAPSHOT_EVERY } from "../src/documents/documents.service.js";
import { WorkspacesService } from "../src/workspaces/workspaces.service.js";
import type { Db } from "../src/db/database.module.js";
import { createServices, createTestDb, createUser } from "./helpers.js";

let db: Db;
let close: () => Promise<void>;
let documents: DocumentsService;
let workspaces: WorkspacesService;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const ctx = createServices(db);
  documents = new DocumentsService(db, ctx.access, ctx.audit, ctx.bus);
  workspaces = new WorkspacesService(db, ctx.access, ctx.audit, ctx.bus, ctx.mailer, { WEB_ORIGIN: "http://localhost:3000" });
});
afterAll(() => close());

function insertion(source: Y.Doc, text: string): Uint8Array {
  let captured: Uint8Array = new Uint8Array();
  const handler = (update: Uint8Array) => (captured = update);
  source.on("update", handler);
  source.getText("body").insert(source.getText("body").length, text);
  source.off("update", handler);
  return captured;
}

async function setup() {
  const owner = await createUser(db);
  const ws = await workspaces.create("Docs", owner);
  const doc = await documents.create(ws.id, "Plan", owner.id);
  return { owner, ws, doc };
}

const persist = (documentId: string, actorId: string, updateId: string, payload: Uint8Array) =>
  documents.persistUpdate({ documentId, actorId, clientId: "c1", updateId, payload, sourceInstanceId: "test" });

describe("update persistence", () => {
  it("assigns versions on the server, in order", async () => {
    const { owner, doc } = await setup();
    const source = new Y.Doc();
    const versions = [];
    for (let index = 0; index < 5; index += 1) {
      versions.push((await persist(doc.id, owner.id, `u${index}`, insertion(source, `${index}`))).version);
    }
    expect(versions).toEqual([1, 2, 3, 4, 5]);
    const [row] = await db.select().from(document).where(eq(document.id, doc.id));
    expect(row?.currentVersion).toBe(5);
  });

  it("is idempotent for a repeated update id and does not advance the version", async () => {
    const { owner, doc } = await setup();
    const payload = insertion(new Y.Doc(), "hello");
    const first = await persist(doc.id, owner.id, "same", payload);
    const second = await persist(doc.id, owner.id, "same", payload);
    expect(second).toEqual({ duplicate: true, version: first.version });
    const [row] = await db.select().from(document).where(eq(document.id, doc.id));
    expect(row?.currentVersion).toBe(1);
  });

  it("assigns distinct versions to concurrent writers", async () => {
    const { owner, doc } = await setup();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => persist(doc.id, owner.id, `c${index}`, insertion(new Y.Doc(), `x${index}`)))
    );
    expect(new Set(results.map((r) => r.version)).size).toBe(8);
  });
});

describe("snapshots", () => {
  it("snapshots every N updates without counting the log, and loads from snapshot + tail", async () => {
    const { owner, doc } = await setup();
    const source = new Y.Doc();
    for (let index = 0; index < SNAPSHOT_EVERY - 1; index += 1) {
      await persist(doc.id, owner.id, `u${index}`, insertion(source, "a"));
      expect(await documents.snapshotIfNeeded(doc.id)).toBe(false);
    }
    await persist(doc.id, owner.id, "last", insertion(source, "a"));
    expect(await documents.snapshotIfNeeded(doc.id)).toBe(true);
    // not triggered again until another N updates arrive
    await persist(doc.id, owner.id, "after", insertion(source, "b"));
    expect(await documents.snapshotIfNeeded(doc.id)).toBe(false);

    const snapshots = await db.select().from(documentSnapshot).where(eq(documentSnapshot.documentId, doc.id));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ version: SNAPSHOT_EVERY, updatesSincePrevious: SNAPSHOT_EVERY });

    const loaded = await documents.loadState(doc.id);
    expect(loaded.version).toBe(SNAPSHOT_EVERY + 1);
    const rebuilt = new Y.Doc();
    Y.applyUpdate(rebuilt, loaded.update);
    expect(rebuilt.getText("body").toString()).toBe(source.getText("body").toString());
  });

  it("reconstructs historical versions", async () => {
    const { owner, doc } = await setup();
    const source = new Y.Doc();
    await persist(doc.id, owner.id, "1", insertion(source, "one "));
    await persist(doc.id, owner.id, "2", insertion(source, "two "));
    await persist(doc.id, owner.id, "3", insertion(source, "three"));
    const atTwo = await documents.stateAt(doc.id, owner.id, 2);
    const rebuilt = new Y.Doc();
    Y.applyUpdate(rebuilt, Buffer.from(atTwo.state, "base64"));
    expect(rebuilt.getText("body").toString()).toBe("one two ");
  });
});

describe("document access", () => {
  it("hides documents from non-members and from removed members", async () => {
    const { owner, ws, doc } = await setup();
    const stranger = await createUser(db);
    await expect(documents.get(doc.id, stranger.id)).rejects.toMatchObject({ status: 404 });

    const member = await createUser(db);
    const invitation = await workspaces.invite(ws.id, owner, member.email, "viewer");
    await workspaces.acceptById(invitation.id, member);
    await expect(documents.get(doc.id, member.id)).resolves.toMatchObject({ role: "viewer" });
    await workspaces.removeMember(ws.id, owner, member.id);
    await expect(documents.get(doc.id, member.id)).rejects.toMatchObject({ status: 404 });
    expect(await documents.recent(member.id)).toEqual([]);
  });

  it("prevents viewers from creating, renaming or deleting documents", async () => {
    const { owner, ws, doc } = await setup();
    const viewer = await createUser(db);
    await workspaces.acceptById((await workspaces.invite(ws.id, owner, viewer.email, "viewer")).id, viewer);
    await expect(documents.create(ws.id, "Nope", viewer.id)).rejects.toMatchObject({ status: 403 });
    await expect(documents.rename(doc.id, "Nope", viewer.id)).rejects.toMatchObject({ status: 403 });
    await expect(documents.remove(doc.id, viewer.id)).rejects.toMatchObject({ status: 403 });
  });

  it("treats LIKE wildcards in search as literal text", async () => {
    const { owner, ws } = await setup();
    await documents.create(ws.id, "100% done", owner.id);
    await documents.create(ws.id, "Other", owner.id);
    const hits = await documents.search(owner.id, "%");
    expect(hits.map((h) => h.title)).toEqual(["100% done"]);
  });
});
