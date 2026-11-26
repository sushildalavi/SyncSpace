import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import type { Db } from "../src/db/database.module.js";
import * as t from "../src/db/schema.js";
import { DocumentsService } from "../src/documents/documents.service.js";
import { SharesService } from "../src/documents/shares.service.js";
import { WorkspacesService } from "../src/workspaces/workspaces.service.js";
import { createServices, createTestDb, createUser } from "./helpers.js";

let db: Db;
let close: () => Promise<void>;
let ctx: ReturnType<typeof createServices>;
let documents: DocumentsService;
let shares: SharesService;
let workspaces: WorkspacesService;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  ctx = createServices(db);
  documents = new DocumentsService(db, ctx.access, ctx.audit, ctx.bus);
  shares = new SharesService(db, ctx.access, ctx.audit, ctx.bus, ctx.mailer, { WEB_ORIGIN: "http://localhost:3000" });
  workspaces = new WorkspacesService(db, ctx.access, ctx.audit, ctx.bus, ctx.mailer, { WEB_ORIGIN: "http://localhost:3000" });
});
afterAll(() => close());

async function fixture() {
  const owner = await createUser(db);
  const guest = await createUser(db);
  const ws = await workspaces.create("Private", owner);
  const shared = await documents.create(ws.id, "Shared plan", owner.id);
  const hidden = await documents.create(ws.id, "Hidden plan", owner.id);
  return { owner, guest, ws, shared, hidden };
}

describe("single-document sharing", () => {
  it("gives access to that document only, never to the workspace or its other documents", async () => {
    const { owner, guest, ws, shared, hidden } = await fixture();
    await expect(documents.get(shared.id, guest.id)).rejects.toMatchObject({ status: 404 });
    await shares.share(shared.id, owner, guest.email.toUpperCase(), "viewer");

    await expect(documents.get(shared.id, guest.id)).resolves.toMatchObject({ role: "viewer", workspaceRole: null, permissions: ["document.read"] });
    await expect(documents.get(hidden.id, guest.id)).rejects.toMatchObject({ status: 404 });
    await expect(documents.list(ws.id, guest.id)).rejects.toMatchObject({ status: 404 });
    await expect(workspaces.listMembers(ws.id, guest.id)).rejects.toMatchObject({ status: 404 });
    expect((await documents.sharedWithMe(guest.id)).map((row) => row.id)).toEqual([shared.id]);
    expect((await documents.search(guest.id, "plan")).map((row) => row.id)).toEqual([shared.id]);
    expect((await documents.recent(guest.id)).map((row) => row.id)).toEqual([shared.id]);
  });

  it("lets a shared editor write but not delete, share, or create documents", async () => {
    const { owner, guest, ws, shared } = await fixture();
    await shares.share(shared.id, owner, guest.email, "editor");
    await expect(documents.rename(shared.id, "Renamed", guest.id)).resolves.toMatchObject({ title: "Renamed" });
    await expect(documents.remove(shared.id, guest.id)).rejects.toMatchObject({ status: 403 });
    await expect(shares.list(shared.id, guest.id)).rejects.toMatchObject({ status: 403 });
    await expect(shares.share(shared.id, guest, "friend@example.com", "viewer")).rejects.toMatchObject({ status: 403 });
    await expect(documents.create(ws.id, "Sneaky", guest.id)).rejects.toMatchObject({ status: 404 });
  });

  it("only lets workspace owners share", async () => {
    const { owner, ws, shared } = await fixture();
    const editor = await createUser(db);
    await db.insert(t.workspaceMember).values({ workspaceId: ws.id, userId: editor.id, role: "editor" });
    await expect(shares.share(shared.id, editor, "x@example.com", "viewer")).rejects.toMatchObject({ status: 403 });
    await expect(shares.share(shared.id, owner, owner.email, "viewer")).rejects.toMatchObject({ status: 400 });
  });

  it("raises a workspace viewer to editor on one document, and drops back when the share is removed", async () => {
    const { owner, ws, shared, hidden } = await fixture();
    const viewer = await createUser(db);
    await db.insert(t.workspaceMember).values({ workspaceId: ws.id, userId: viewer.id, role: "viewer" });
    const share = await shares.share(shared.id, owner, viewer.email, "editor");
    await expect(documents.get(shared.id, viewer.id)).resolves.toMatchObject({ role: "editor", workspaceRole: "viewer" });
    await expect(documents.get(hidden.id, viewer.id)).resolves.toMatchObject({ role: "viewer" });
    expect(await documents.sharedWithMe(viewer.id)).toEqual([]); // already visible through the workspace
    await shares.remove(shared.id, share.id, owner.id);
    await expect(documents.get(shared.id, viewer.id)).resolves.toMatchObject({ role: "viewer" });
  });

  it("does not honour a share until the address is verified", async () => {
    const { owner, shared } = await fixture();
    const unverified = await createUser(db, { emailVerified: false });
    await shares.share(shared.id, owner, unverified.email, "editor");
    await expect(documents.get(shared.id, unverified.id)).rejects.toMatchObject({ status: 404 });
    await db.update(t.user).set({ emailVerified: true }).where(eq(t.user.id, unverified.id));
    await expect(documents.get(shared.id, unverified.id)).resolves.toMatchObject({ role: "editor" });
  });

  it("changes the role in place, emails once, and tells open sockets", async () => {
    const { owner, guest, shared } = await fixture();
    ctx.sent.length = 0;
    ctx.bus.published.length = 0;
    await shares.share(shared.id, owner, guest.email, "viewer");
    await shares.share(shared.id, owner, guest.email, "editor");
    expect(await shares.list(shared.id, owner.id)).toEqual([expect.objectContaining({ email: guest.email, role: "editor" })]);
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0]!.text).toContain(`/d/${shared.id}`);
    expect(ctx.bus.published.filter((event) => event.type === "access.changed")).toHaveLength(2);
  });

  it("cannot remove a share through a different document", async () => {
    const { owner, guest, shared, hidden } = await fixture();
    const share = await shares.share(shared.id, owner, guest.email, "viewer");
    await expect(shares.remove(hidden.id, share.id, owner.id)).rejects.toMatchObject({ status: 404 });
    await expect(documents.get(shared.id, guest.id)).resolves.toBeTruthy();
  });

  it("stops at a deleted document", async () => {
    const { owner, guest, shared } = await fixture();
    await shares.share(shared.id, owner, guest.email, "editor");
    await documents.persistUpdate({ documentId: shared.id, actorId: guest.id, clientId: "c", updateId: "u1", payload: Y.encodeStateAsUpdate(new Y.Doc()), sourceInstanceId: "t" });
    await documents.remove(shared.id, owner.id);
    await expect(documents.get(shared.id, guest.id)).rejects.toMatchObject({ status: 404 });
    expect(await documents.sharedWithMe(guest.id)).toEqual([]);
  });
});
