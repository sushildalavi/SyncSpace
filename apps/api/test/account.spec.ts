import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../src/auth/auth.factory.js";
import { resolveSession } from "../src/auth/session.guard.js";
import type { Db } from "../src/db/database.module.js";
import * as t from "../src/db/schema.js";
import { DocumentsService } from "../src/documents/documents.service.js";
import { SharesService } from "../src/documents/shares.service.js";
import { AccountService, DELETED_USER_ID } from "../src/me/account.service.js";
import { WorkspacesService } from "../src/workspaces/workspaces.service.js";
import { createServices, createTestDb } from "./helpers.js";

const API = "http://localhost:3001";
const WEB = "http://localhost:3000";
const PASSWORD = "correct-horse-battery";

let db: Db;
let close: () => Promise<void>;
let auth: ReturnType<typeof createAuth>;
let ctx: ReturnType<typeof createServices>;
let accounts: AccountService;
let documents: DocumentsService;
let workspaces: WorkspacesService;
let shares: SharesService;
const mail: Array<{ to: string; subject: string; text: string }> = [];
const events: Array<{ type: string; userId: string }> = [];

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  ctx = createServices(db);
  auth = createAuth({
    db,
    sendMail: async (message) => void mail.push(message),
    audit: (event) => void events.push(event),
    env: { NODE_ENV: "test", BETTER_AUTH_SECRET: "x".repeat(40), API_BASE_URL: API, WEB_ORIGIN: WEB, REQUIRE_EMAIL_VERIFICATION: false, SESSION_TTL_DAYS: 7 }
  });
  accounts = new AccountService(db, auth, ctx.audit, ctx.bus);
  documents = new DocumentsService(db, ctx.access, ctx.audit, ctx.bus);
  workspaces = new WorkspacesService(db, ctx.access, ctx.audit, ctx.bus, ctx.mailer, { WEB_ORIGIN: WEB });
  shares = new SharesService(db, ctx.access, ctx.audit, ctx.bus, ctx.mailer, { WEB_ORIGIN: WEB });
});
afterAll(() => close());

/** A tiny browser: keeps cookies and talks to Better Auth's real HTTP handler. */
function browser() {
  const jar = new Map<string, string>();
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const cookie = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  return {
    headers: () => ({ cookie: cookie(), origin: WEB }),
    async call(path: string, body?: unknown) {
      const url = path.startsWith("http") ? path : `${API}/api/auth${path}`;
      const response = await auth.handler(
        new Request(url, {
          method: body ? "POST" : "GET",
          headers: { cookie: cookie(), origin: WEB, "x-forwarded-for": ip, ...(body ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        })
      );
      for (const header of response.headers.getSetCookie()) {
        const [pair] = header.split(";");
        const [name, ...rest] = pair!.split("=");
        const value = rest.join("=");
        if (value && !/max-age=0/i.test(header)) jar.set(name!, value);
        else jar.delete(name!);
      }
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    session: () => resolveSession(auth, { cookie: cookie() })
  };
}

const lastLink = (to: string, subject: string) => {
  const found = [...mail].reverse().find((m) => m.to === to && m.subject.includes(subject));
  expect(found, `${subject} to ${to}`).toBeDefined();
  return found!.text.match(/https?:\/\/\S+/)![0];
};

let counter = 0;
async function register({ verify = true } = {}) {
  counter += 1;
  const email = `person${counter}@example.com`;
  const client = browser();
  expect((await client.call("/sign-up/email", { name: `Person ${counter}`, email, password: PASSWORD })).status).toBe(200);
  if (verify) await client.call(lastLink(email, "Confirm your SyncSpace email"));
  else if (!(await client.session())) await client.call("/sign-in/email", { email, password: PASSWORD });
  const session = (await client.session())!;
  return { client, email, session, user: session.user };
}

/** RFC 6238, as an authenticator app computes it. */
function totp(uri: string, at = Date.now()) {
  const secret = new URL(uri).searchParams.get("secret")!;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "")) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac("sha1", key).update(counterBytes).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

describe("two-factor sign-in", () => {
  it("refuses to turn on for an unconfirmed address, whose confirmation link would skip the second factor", async () => {
    const { client } = await register({ verify: false });
    const result = await client.call("/two-factor/enable", { password: PASSWORD });
    expect(result.status).toBe(403);
  });

  it("asks for a code after the password, and accepts the code or one backup code once", async () => {
    const { client, email } = await register();
    const enabled = await client.call("/two-factor/enable", { password: PASSWORD });
    expect(enabled.status).toBe(200);
    const [stored] = await db.select().from(t.twoFactor).orderBy(t.twoFactor.id);
    expect(stored!.secret).not.toContain(new URL(enabled.body.totpURI).searchParams.get("secret")!);
    events.length = 0;
    expect((await client.call("/two-factor/verify-totp", { code: totp(enabled.body.totpURI) })).status).toBe(200);
    expect(events.map((event) => event.type)).toContain("auth.two_factor_enabled");

    const next = browser();
    events.length = 0;
    const challenged = await next.call("/sign-in/email", { email, password: PASSWORD });
    expect(challenged.body).toMatchObject({ twoFactorRedirect: true });
    expect(await next.session()).toBeNull();
    expect(events.map((event) => event.type)).toEqual(["auth.two_factor_challenged"]);

    expect((await next.call("/two-factor/verify-totp", { code: "000000" })).status).toBe(401);
    expect(await next.session()).toBeNull();
    expect((await next.call("/two-factor/verify-totp", { code: totp(enabled.body.totpURI) })).status).toBe(200);
    expect(await next.session()).not.toBeNull();

    const code = enabled.body.backupCodes[0];
    const backup = browser();
    await backup.call("/sign-in/email", { email, password: PASSWORD });
    expect((await backup.call("/two-factor/verify-backup-code", { code })).status).toBe(200);
    const reuse = browser();
    await reuse.call("/sign-in/email", { email, password: PASSWORD });
    expect((await reuse.call("/two-factor/verify-backup-code", { code })).status).toBe(401);
    expect(await reuse.session()).toBeNull();
  });
});

describe("changing the email address", () => {
  it("is refused until the current address is confirmed", async () => {
    const { client } = await register({ verify: false });
    expect((await client.call("/change-email", { newEmail: "other@example.com" })).status).toBe(403);
  });

  it("needs approval from the old address and then proof of the new one", async () => {
    const { client, email, user } = await register();
    const target = "moved@example.com";
    expect((await client.call("/change-email", { newEmail: target, callbackURL: `${WEB}/settings` })).status).toBe(200);
    const current = async () => (await db.select().from(t.user).where(eq(t.user.id, user.id)))[0]!.email;
    expect(await current()).toBe(email);
    await client.call(lastLink(email, "Approve your SyncSpace email change"));
    expect(await current()).toBe(email);
    events.length = 0;
    await client.call(lastLink(target, "Confirm your SyncSpace email"));
    expect(await current()).toBe(target);
    expect(events.map((event) => event.type)).toContain("auth.email_changed");
  });

  it("keeps documents shared with the account", async () => {
    const owner = await register();
    const guest = await register();
    const ws = await workspaces.create("Team", owner.user);
    const doc = await documents.create(ws.id, "Brief", owner.user.id);
    await shares.share(doc.id, owner.user, guest.email, "editor");
    await guest.client.call("/change-email", { newEmail: "renamed@example.com", callbackURL: `${WEB}/settings` });
    await guest.client.call(lastLink(guest.email, "Approve your SyncSpace email change"));
    await guest.client.call(lastLink("renamed@example.com", "Confirm your SyncSpace email"));
    await expect(documents.get(doc.id, guest.user.id)).resolves.toMatchObject({ role: "editor" });
  });

  it("binds a share made before the person signed up", async () => {
    const owner = await register();
    const ws = await workspaces.create("Early", owner.user);
    const doc = await documents.create(ws.id, "Waiting", owner.user.id);
    await shares.share(doc.id, owner.user, `person${counter + 1}@example.com`, "viewer");
    const late = await register();
    const [row] = await db.select().from(t.documentShare).where(eq(t.documentShare.documentId, doc.id));
    expect(row!.userId).toBe(late.user.id);
  });
});

describe("account deletion", () => {
  const remove = (person: Awaited<ReturnType<typeof register>>, input: { confirmEmail?: string; password?: string } = {}) =>
    accounts.delete(person.session, { confirmEmail: person.email, password: PASSWORD, ...input }, person.client.headers());

  it("needs the right address and the right password, and limits guessing", async () => {
    const person = await register();
    await expect(remove(person, { confirmEmail: "someone@else.com" })).rejects.toMatchObject({ status: 400 });
    await expect(remove(person, { password: undefined })).rejects.toMatchObject({ status: 400 });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(remove(person, { password: "wrong-password-1" })).rejects.toMatchObject({ status: 400 });
    }
    await expect(remove(person)).rejects.toMatchObject({ status: 429 });
    expect(await person.client.session()).not.toBeNull();
  });

  it("is blocked while others depend on this person as the only owner", async () => {
    const owner = await register();
    const member = await register();
    const ws = await workspaces.create("Crew", owner.user);
    await db.insert(t.workspaceMember).values({ workspaceId: ws.id, userId: member.user.id, role: "editor" });
    await expect(accounts.deletionPreview(owner.user.id)).resolves.toMatchObject({ blockers: [{ id: ws.id, name: "Crew" }] });
    await expect(remove(owner)).rejects.toMatchObject({ status: 409 });
    expect(await owner.client.session()).not.toBeNull();
  });

  it("removes the person and their private workspaces, and keeps shared history without their name", async () => {
    const leaver = await register();
    const stayer = await register();
    const solo = await workspaces.create("Solo", leaver.user);
    const soloDoc = await documents.create(solo.id, "Diary", leaver.user.id);
    const team = await workspaces.create("Together", leaver.user);
    await db.insert(t.workspaceMember).values({ workspaceId: team.id, userId: stayer.user.id, role: "owner" });
    const teamDoc = await documents.create(team.id, "Roadmap", leaver.user.id);
    await documents.persistUpdate({ documentId: teamDoc.id, actorId: leaver.user.id, clientId: "c", updateId: "mine", payload: new Uint8Array([0, 0]), sourceInstanceId: "t" });
    await shares.share(teamDoc.id, stayer.user, "outsider@example.com", "viewer");
    ctx.bus.published.length = 0;

    await expect(accounts.deletionPreview(leaver.user.id)).resolves.toMatchObject({
      requiresPassword: true,
      blockers: [],
      workspacesToDelete: [{ id: solo.id, name: "Solo", documentCount: 1 }]
    });
    await remove(leaver);

    expect(await db.select().from(t.user).where(eq(t.user.id, leaver.user.id))).toHaveLength(0);
    expect(await db.select().from(t.account).where(eq(t.account.userId, leaver.user.id))).toHaveLength(0);
    expect(await leaver.client.session()).toBeNull();
    expect(await db.select().from(t.document).where(eq(t.document.id, soloDoc.id))).toHaveLength(0);
    const history = await documents.history(teamDoc.id, stayer.user.id);
    expect(history.updates).toEqual([expect.objectContaining({ actorId: DELETED_USER_ID, actorName: "Deleted user" })]);
    const [kept] = await db.select().from(t.workspace).where(eq(t.workspace.id, team.id));
    expect(kept!.ownerId).toBe(stayer.user.id);
    const audits = await db.select().from(t.auditEvent);
    expect(JSON.stringify(audits)).not.toContain(leaver.email);
    expect(ctx.bus.published).toContainEqual(expect.objectContaining({ type: "session.revoked", userId: leaver.user.id }));
    expect(ctx.bus.published).toContainEqual({ type: "document.deleted", documentId: soloDoc.id });
    // the address is free again, and the new account inherits nothing
    const again = browser();
    expect((await again.call("/sign-up/email", { name: "New", email: leaver.email, password: PASSWORD })).status).toBe(200);
  });

  it("asks an account without a password for a recent sign-in", async () => {
    const person = await register();
    await db.delete(t.account).where(eq(t.account.userId, person.user.id));
    await db.update(t.session).set({ createdAt: new Date(Date.now() - 3_600_000) }).where(eq(t.session.userId, person.user.id));
    await expect(remove(person, { password: undefined })).rejects.toMatchObject({ status: 403 });
    await db.update(t.session).set({ createdAt: new Date() }).where(eq(t.session.userId, person.user.id));
    await expect(remove(person, { password: undefined })).resolves.toBeUndefined();
  });
});
