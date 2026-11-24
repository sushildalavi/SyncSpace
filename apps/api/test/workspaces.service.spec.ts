import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { WorkspacesService } from "../src/workspaces/workspaces.service.js";
import { workspace, workspaceMember } from "../src/db/schema.js";
import type { AuditService } from "../src/audit/audit.service.js";
import type { Db } from "../src/db/database.module.js";
import { createServices, createTestDb, createUser } from "./helpers.js";

let db: Db;
let close: () => Promise<void>;
let ctx: ReturnType<typeof createServices>;
let service: WorkspacesService;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  ctx = createServices(db);
  service = new WorkspacesService(db, ctx.access, ctx.audit, ctx.bus, ctx.mailer, { WEB_ORIGIN: "http://localhost:3000" });
});
afterAll(() => close());

describe("workspace creation", () => {
  it("creates the workspace and the owner membership together", async () => {
    const owner = await createUser(db);
    const created = await service.create("Product", owner);
    const members = await db.select().from(workspaceMember).where(eq(workspaceMember.workspaceId, created.id));
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: owner.id, role: "owner" });
  });

  it("leaves nothing behind when any step fails", async () => {
    const owner = await createUser(db);
    const failingAudit = { record: async () => { throw new Error("boom"); } } as unknown as AuditService;
    const broken = new WorkspacesService(db, ctx.access, failingAudit, ctx.bus, ctx.mailer, { WEB_ORIGIN: "http://localhost:3000" });
    const before = await db.select({ n: count() }).from(workspace);
    await expect(broken.create("Ghost", owner)).rejects.toThrow("boom");
    const after = await db.select({ n: count() }).from(workspace);
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});

describe("last-owner protection", () => {
  it("refuses to demote or remove the only owner", async () => {
    const owner = await createUser(db);
    const ws = await service.create("Solo", owner);
    await expect(service.updateMemberRole(ws.id, owner, owner.id, "editor")).rejects.toMatchObject({ status: 409 });
    await expect(service.removeMember(ws.id, owner, owner.id)).rejects.toMatchObject({ status: 409 });
    const [row] = await db.select().from(workspaceMember).where(eq(workspaceMember.workspaceId, ws.id));
    expect(row?.role).toBe("owner");
  });

  it("allows an owner to step down once another owner exists", async () => {
    const first = await createUser(db);
    const second = await createUser(db);
    const ws = await service.create("Pair", first);
    const invite = await service.invite(ws.id, first, second.email, "owner");
    await service.acceptById(invite.id, second);
    await service.updateMemberRole(ws.id, first, first.id, "editor");
    const members = await service.listMembers(ws.id, second.id);
    expect(members.map((m) => m.role).sort()).toEqual(["editor", "owner"]);
    // ...and now the remaining owner is protected.
    await expect(service.updateMemberRole(ws.id, second, second.id, "viewer")).rejects.toMatchObject({ status: 409 });
  });
});

describe("authorization", () => {
  it("does not let viewers or editors manage members", async () => {
    const owner = await createUser(db);
    const viewer = await createUser(db);
    const editor = await createUser(db);
    const ws = await service.create("Team", owner);
    await service.acceptById((await service.invite(ws.id, owner, viewer.email, "viewer")).id, viewer);
    await service.acceptById((await service.invite(ws.id, owner, editor.email, "editor")).id, editor);
    await expect(service.invite(ws.id, viewer, "x@example.com", "viewer")).rejects.toMatchObject({ status: 403 });
    await expect(service.updateMemberRole(ws.id, editor, viewer.id, "owner")).rejects.toMatchObject({ status: 403 });
    await expect(service.removeMember(ws.id, editor, viewer.id)).rejects.toMatchObject({ status: 403 });
  });

  it("hides workspaces from non-members", async () => {
    const owner = await createUser(db);
    const stranger = await createUser(db);
    const ws = await service.create("Private", owner);
    await expect(service.get(ws.id, stranger.id)).rejects.toMatchObject({ status: 404 });
  });

  it("notifies live sockets when a role changes or a member is removed", async () => {
    const owner = await createUser(db);
    const member = await createUser(db);
    const ws = await service.create("Live", owner);
    await service.acceptById((await service.invite(ws.id, owner, member.email, "editor")).id, member);
    ctx.bus.published.length = 0;
    await service.updateMemberRole(ws.id, owner, member.id, "viewer");
    await service.removeMember(ws.id, owner, member.id);
    expect(ctx.bus.published).toEqual([
      { type: "access.changed", workspaceId: ws.id, userId: member.id, role: "viewer" },
      { type: "access.changed", workspaceId: ws.id, userId: member.id, role: null }
    ]);
  });
});

describe("invitations", () => {
  it("emails a token link and accepts it only for the invited address", async () => {
    const owner = await createUser(db);
    const invitee = await createUser(db, { emailVerified: false });
    const other = await createUser(db);
    const ws = await service.create("Invites", owner);
    await service.invite(ws.id, owner, invitee.email, "editor");
    const mail = ctx.sent.at(-1)!;
    const token = decodeURIComponent(/token=([^\s&]+)/.exec(mail.text)![1]!);

    await expect(service.acceptByToken(token, other)).rejects.toMatchObject({ status: 403 });
    // unverified accounts can't accept from the in-app list, but the emailed token proves the address
    expect(await service.listMine(invitee)).toEqual([]);
    await service.acceptByToken(token, invitee);
    expect((await service.get(ws.id, invitee.id)).role).toBe("editor");
    await expect(service.acceptByToken(token, invitee)).rejects.toMatchObject({ status: 404 });
  });

  it("lets owners revoke pending invitations", async () => {
    const owner = await createUser(db);
    const invitee = await createUser(db);
    const ws = await service.create("Revoke", owner);
    const invite = await service.invite(ws.id, owner, invitee.email, "viewer");
    await service.revokeInvitation(ws.id, invite.id, owner);
    await expect(service.acceptById(invite.id, invitee)).rejects.toMatchObject({ status: 404 });
  });
});
