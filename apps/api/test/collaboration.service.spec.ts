import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import * as Y from "yjs";
import { CLOSE_CODES } from "@syncspace/contracts";
import { CollaborationService } from "../src/collaboration/collaboration.service.js";
import type { Db } from "../src/db/database.module.js";
import { session as sessionTable } from "../src/db/schema.js";
import { DocumentsService } from "../src/documents/documents.service.js";
import { SharesService } from "../src/documents/shares.service.js";
import type { BusEnvelope, BusEvent, RealtimeBus } from "../src/realtime/realtimeBus.service.js";
import { WorkspacesService } from "../src/workspaces/workspaces.service.js";
import type { AuthenticatedUser } from "../src/auth/session.guard.js";
import { eq } from "drizzle-orm";
import { createServices, createTestDb, createUser } from "./helpers.js";

const ORIGIN = "http://localhost:3000";

/** Stands in for Redis: one shared event log delivered to every "instance", like a Stream read with XREAD. */
class Hub {
  readonly buses: FakeBus[] = [];
  readonly hashes = new Map<string, Map<string, string>>();
  deliver(envelope: BusEnvelope) {
    queueMicrotask(() => this.buses.forEach((bus) => bus.handlers.forEach((handler) => handler(envelope))));
  }
}
class FakeBus {
  readonly instanceId = randomUUID();
  readonly handlers = new Set<(envelope: BusEnvelope) => void>();
  constructor(private readonly hub: Hub) {
    hub.buses.push(this);
  }
  subscribe(handler: (envelope: BusEnvelope) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  async publish(event: BusEvent) {
    this.hub.deliver({ instanceId: this.instanceId, event });
  }
  redis = {
    hset: async (key: string, field: string, value: string) => {
      const map = this.hub.hashes.get(key) ?? new Map();
      map.set(field, value);
      this.hub.hashes.set(key, map);
    },
    pexpire: async () => 1,
    hgetall: async (key: string) => Object.fromEntries(this.hub.hashes.get(key) ?? []),
    hdel: async (key: string, ...fields: string[]) => fields.forEach((field) => this.hub.hashes.get(key)?.delete(field))
  };
}

type Instance = { service: CollaborationService; server: WebSocketServer; url: string };

let db: Db;
let closeDb: () => Promise<void>;
let hub: Hub;
let documents: DocumentsService;
let workspaces: WorkspacesService;
let shares: SharesService;
const instances: Instance[] = [];
const sessions = new Map<string, AuthenticatedUser>();
const sockets: WebSocket[] = [];
const outage = { session: false };

beforeAll(async () => {
  ({ db, close: closeDb } = await createTestDb());
  hub = new Hub();
  const ctx = createServices(db);
  const hubBus = new FakeBus(hub) as unknown as RealtimeBus;
  documents = new DocumentsService(db, ctx.access, ctx.audit, hubBus);
  workspaces = new WorkspacesService(db, ctx.access, ctx.audit, hubBus, ctx.mailer, { WEB_ORIGIN: ORIGIN });
  shares = new SharesService(db, ctx.access, ctx.audit, hubBus, ctx.mailer, { WEB_ORIGIN: ORIGIN });

  const auth = {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        if (outage.session) throw new Error("database unavailable");
        const sid = /sid=([^;]+)/.exec(headers.get("cookie") ?? "")?.[1];
        const user = sid ? sessions.get(sid) : undefined;
        return user ? { session: { id: sid }, user } : null;
      }
    }
  };

  for (let index = 0; index < 2; index += 1) {
    const bus = new FakeBus(hub) as unknown as RealtimeBus;
    const service = new CollaborationService(db, auth as never, ctx.access, documents, bus, { WEB_ORIGIN: ORIGIN });
    service.onModuleInit();
    const server = new WebSocketServer({ port: 0 });
    server.on("connection", (socket, request) => void service.handleConnection(socket, request));
    instances.push({ service, server, url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/collaboration` });
  }
});

afterAll(async () => {
  sockets.forEach((socket) => socket.terminate());
  instances.forEach(({ service, server }) => {
    service.onModuleDestroy();
    server.close();
  });
  await closeDb();
});

async function signIn(user: AuthenticatedUser): Promise<string> {
  const id = randomUUID();
  sessions.set(id, user);
  await db.insert(sessionTable).values({ id, token: randomUUID(), userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) });
  return id;
}

type Client = { socket: WebSocket; messages: any[]; closed: Promise<number>; waitFor: (type: string) => Promise<any>; send: (type: string, payload: unknown) => void };

function connect(instance: Instance, documentId: string, sid: string | null, origin: string | null = ORIGIN): Client {
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  if (sid) headers.cookie = `sid=${sid}`;
  const socket = new WebSocket(`${instance.url}?documentId=${documentId}&clientId=test`, { headers });
  sockets.push(socket);
  const messages: any[] = [];
  const waiters: Array<{ type: string; resolve: (value: any) => void }> = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    messages.push(message);
    waiters.filter((w) => w.type === message.type).forEach((w) => w.resolve(message));
  });
  const closed = new Promise<number>((resolve) => socket.on("close", (code) => resolve(code)));
  return {
    socket,
    messages,
    closed,
    waitFor: (type) => {
      const existing = messages.find((m) => m.type === type);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        waiters.push({ type, resolve });
        setTimeout(() => reject(new Error(`timed out waiting for ${type}; got ${messages.map((m) => m.type)}`)), 3000);
      });
    },
    send: (type, payload) => socket.send(JSON.stringify({ type, payload }))
  };
}

async function fixture() {
  const owner = await createUser(db);
  const ws = await workspaces.create("Collab", owner);
  const doc = await documents.create(ws.id, "Shared", owner.id);
  const add = async (role: "editor" | "viewer") => {
    const user = await createUser(db);
    await workspaces.acceptById((await workspaces.invite(ws.id, owner, user.email, role)).id, user);
    return user;
  };
  return { owner, ws, doc, add };
}

function update(text: string) {
  const source = new Y.Doc();
  let bytes: Uint8Array = new Uint8Array();
  source.on("update", (u: Uint8Array) => (bytes = u));
  source.getText("body").insert(0, text);
  return Buffer.from(bytes).toString("base64");
}

const body = (id: string, payload: string, updateId = randomUUID()) => ({ documentId: id, updateId, payload });

describe("connection security", () => {
  it("rejects anonymous sockets, foreign origins and non-members", async () => {
    const { doc } = await fixture();
    const stranger = await createUser(db);
    expect(await connect(instances[0]!, doc.id, null).closed).toBe(CLOSE_CODES.unauthenticated);
    expect(await connect(instances[0]!, doc.id, await signIn(stranger), "https://evil.example").closed).toBe(CLOSE_CODES.forbidden);
    expect(await connect(instances[0]!, doc.id, await signIn(stranger)).closed).toBe(CLOSE_CODES.notFound);
  });

  it("does not accept credentials from the URL", async () => {
    const { doc, owner } = await fixture();
    const sid = await signIn(owner);
    const socket = new WebSocket(`${instances[0]!.url}?documentId=${doc.id}&token=${sid}&sid=${sid}`, { headers: { origin: ORIGIN } });
    sockets.push(socket);
    expect(await new Promise((resolve) => socket.on("close", resolve))).toBe(CLOSE_CODES.unauthenticated);
  });
});

describe("document updates", () => {
  it("persists with a server-assigned version and delivers across instances", async () => {
    const { doc, owner, add } = await fixture();
    const editor = await add("editor");
    const a = connect(instances[0]!, doc.id, await signIn(owner));
    const b = connect(instances[1]!, doc.id, await signIn(editor));
    await a.waitFor("document.snapshot");
    await b.waitFor("document.snapshot");

    // the client tries to dictate a version; the schema strips it and the server decides
    a.send("document.update", { ...body(doc.id, update("hello")), version: 999, baseVersion: 998 });
    const ack = await a.waitFor("document.ack");
    expect(ack.payload.version).toBe(1);

    const delivered = await b.waitFor("document.update");
    expect(delivered.payload).toMatchObject({ documentId: doc.id, version: 1, actorId: owner.id });
    expect((await documents.get(doc.id, owner.id)).currentVersion).toBe(1);
  });

  it("refuses writes from viewers and persists nothing", async () => {
    const { doc, add } = await fixture();
    const viewer = await add("viewer");
    const client = connect(instances[0]!, doc.id, await signIn(viewer));
    const snapshot = await client.waitFor("document.snapshot");
    expect(snapshot.payload.role).toBe("viewer");
    const updateId = randomUUID();
    client.send("document.update", body(doc.id, update("sneaky"), updateId));
    const rejected = await client.waitFor("document.rejected");
    expect(rejected.payload).toEqual({ updateId, reason: "read_only" });
    expect((await documents.loadState(doc.id)).version).toBe(0);
  });

  it("rejects malformed payloads and writes for a different document", async () => {
    const { doc, owner } = await fixture();
    const client = connect(instances[0]!, doc.id, await signIn(owner));
    await client.waitFor("document.snapshot");
    client.send("document.update", body(doc.id, Buffer.from("not a yjs update").toString("base64")));
    expect((await client.waitFor("document.rejected")).payload.reason).toBe("malformed");
    client.send("document.update", body(randomUUID(), update("x")));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(client.messages.filter((m) => m.type === "document.rejected").map((m) => m.payload.reason)).toContain("wrong_document");
    expect((await documents.loadState(doc.id)).version).toBe(0);
  });

  it("sends a new connection the persisted state", async () => {
    const { doc, owner } = await fixture();
    const writer = connect(instances[0]!, doc.id, await signIn(owner));
    await writer.waitFor("document.snapshot");
    writer.send("document.update", body(doc.id, update("persisted text")));
    await writer.waitFor("document.ack");
    const late = connect(instances[1]!, doc.id, await signIn(owner));
    const snapshot = await late.waitFor("document.snapshot");
    const rebuilt = new Y.Doc();
    Y.applyUpdate(rebuilt, Buffer.from(snapshot.payload.snapshot, "base64"));
    expect(rebuilt.getText("body").toString()).toBe("persisted text");
    expect(snapshot.payload.version).toBe(1);
  });
});

describe("access changes on live sockets", () => {
  it("closes the socket on every instance when a member is removed", async () => {
    const { doc, ws, owner, add } = await fixture();
    const editor = await add("editor");
    const sid = await signIn(editor);
    const first = connect(instances[0]!, doc.id, sid);
    const second = connect(instances[1]!, doc.id, sid);
    await first.waitFor("document.snapshot");
    await second.waitFor("document.snapshot");
    await workspaces.removeMember(ws.id, owner, editor.id);
    expect(await first.closed).toBe(CLOSE_CODES.accessRevoked);
    expect(await second.closed).toBe(CLOSE_CODES.accessRevoked);
  });

  it("downgrades a connection immediately when its role changes", async () => {
    const { doc, ws, owner, add } = await fixture();
    const editor = await add("editor");
    const client = connect(instances[0]!, doc.id, await signIn(editor));
    await client.waitFor("document.snapshot");
    await workspaces.updateMemberRole(ws.id, owner, editor.id, "viewer");
    expect((await client.waitFor("access.updated")).payload.role).toBe("viewer");
    client.send("document.update", body(doc.id, update("late edit")));
    expect((await client.waitFor("document.rejected")).payload.reason).toBe("read_only");
  });

  it("enforces a role change even if the notification was missed", async () => {
    const { doc, ws, owner, add } = await fixture();
    const editor = await add("editor");
    const client = connect(instances[0]!, doc.id, await signIn(editor));
    await client.waitFor("document.snapshot");
    // bypass the service so no bus event is emitted
    await db.execute(`update workspace_member set role = 'viewer' where workspace_id = '${ws.id}' and user_id = '${editor.id}'` as never);
    client.send("document.update", body(doc.id, update("missed event")));
    expect((await client.waitFor("document.rejected")).payload.reason).toBe("read_only");
    void owner;
  });

  it("closes sockets when the session is revoked, with or without a bus event", async () => {
    const { doc, owner } = await fixture();
    const viaEvent = await signIn(owner);
    const viaSweep = await signIn(owner);
    const a = connect(instances[0]!, doc.id, viaEvent);
    const b = connect(instances[1]!, doc.id, viaSweep);
    await a.waitFor("document.snapshot");
    await b.waitFor("document.snapshot");

    await instances[0]!.service["bus"].publish({ type: "session.revoked", userId: owner.id, sessionId: viaEvent });
    expect(await a.closed).toBe(CLOSE_CODES.sessionRevoked);

    await db.delete(sessionTable).where(eq(sessionTable.id, viaSweep));
    await instances[1]!.service.revalidate();
    expect(await b.closed).toBe(CLOSE_CODES.sessionRevoked);
  });
});

describe("presence", () => {
  it("stamps identity from the session and removes it when the user leaves", async () => {
    const { doc, owner, add } = await fixture();
    const editor = await add("editor");
    const a = connect(instances[0]!, doc.id, await signIn(owner));
    const b = connect(instances[1]!, doc.id, await signIn(editor));
    await a.waitFor("document.snapshot");
    await b.waitFor("document.snapshot");
    a.send("presence.update", { status: "active", cursor: { anchor: 1 }, userName: "Mallory", userId: "someone-else" });
    const state = await b.waitFor("presence.state");
    expect(state.payload).toMatchObject({ userId: owner.id, userName: owner.name, status: "active" });

    a.socket.close();
    const left = await b.waitFor("presence.leave");
    expect(left.payload.connectionId).toBe(state.payload.connectionId);
  });
});

describe("self-healing sync", () => {
  it("tells connected clients the latest persisted version, and resends state on request", async () => {
    const { doc, owner } = await fixture();
    const client = connect(instances[0]!, doc.id, await signIn(owner));
    await client.waitFor("document.snapshot");
    client.send("document.update", body(doc.id, update("first")));
    await client.waitFor("document.ack");

    await instances[0]!.service.broadcastSyncChecks();
    const check = await client.waitFor("sync.check");
    expect(check.payload).toEqual({ documentId: doc.id, version: 1 });

    // a client that missed events asks for the state again and gets the full document
    client.messages.length = 0;
    client.send("sync.request", {});
    const snapshot = await client.waitFor("document.snapshot");
    const rebuilt = new Y.Doc();
    Y.applyUpdate(rebuilt, Buffer.from(snapshot.payload.snapshot, "base64"));
    expect(rebuilt.getText("body").toString()).toBe("first");
    expect(snapshot.payload.version).toBe(1);
  });

  it("delivers server-authored updates (a restore) to sockets on the instance that published them", async () => {
    const { doc, owner } = await fixture();
    const local = connect(instances[0]!, doc.id, await signIn(owner));
    const other = connect(instances[1]!, doc.id, await signIn(owner));
    await local.waitFor("document.snapshot");
    await other.waitFor("document.snapshot");
    await instances[0]!.service["bus"].publish({ type: "document.update", documentId: doc.id, connectionId: "server", updateId: "restore-x", version: 7, payload: update("restored"), actorId: owner.id });
    expect((await local.waitFor("document.update")).payload.version).toBe(7);
    expect((await other.waitFor("document.update")).payload.version).toBe(7);
  });
});

describe("single-document shares on live sockets", () => {
  it("admits a guest to the shared document only, and applies role changes and removal immediately", async () => {
    const { doc, owner, ws } = await fixture();
    const other = await documents.create(ws.id, "Not shared", owner.id);
    const guest = await createUser(db);
    const share = await shares.share(doc.id, owner, guest.email, "editor");
    const sid = await signIn(guest);
    expect(await connect(instances[0]!, other.id, sid).closed).toBe(CLOSE_CODES.notFound);

    const client = connect(instances[1]!, doc.id, sid);
    await client.waitFor("document.snapshot");
    client.send("document.update", body(doc.id, update("from the guest")));
    await client.waitFor("document.ack");

    await shares.share(doc.id, owner, guest.email, "viewer");
    expect((await client.waitFor("access.updated")).payload.role).toBe("viewer");
    client.send("document.update", body(doc.id, update("too late")));
    expect((await client.waitFor("document.rejected")).payload.reason).toBe("read_only");

    await shares.remove(doc.id, share.id, owner.id);
    expect(await client.closed).toBe(CLOSE_CODES.accessRevoked);
  });

  it("keeps a removed member connected to a document that is still shared with them", async () => {
    const { doc, owner, ws, add } = await fixture();
    const member = await add("editor");
    await shares.share(doc.id, owner, member.email, "viewer");
    const client = connect(instances[0]!, doc.id, await signIn(member));
    await client.waitFor("document.snapshot");
    await workspaces.removeMember(ws.id, owner, member.id);
    expect((await client.waitFor("access.updated")).payload.role).toBe("viewer");
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });
});

describe("database trouble", () => {
  it("asks the client to retry, instead of saying it is signed out, when the session can't be checked", async () => {
    const { doc, owner } = await fixture();
    const sid = await signIn(owner);
    outage.session = true;
    try {
      expect(await connect(instances[0]!, doc.id, sid).closed).toBe(CLOSE_CODES.tryAgain);
    } finally {
      outage.session = false;
    }
  });

  it("closes for a retry when an update can't be saved, and saves it when sent again", async () => {
    const { doc, owner } = await fixture();
    const sid = await signIn(owner);
    const client = connect(instances[0]!, doc.id, sid);
    await client.waitFor("document.snapshot");
    const spy = vi.spyOn(documents, "persistUpdate").mockRejectedValueOnce(new Error("connection terminated"));
    const message = body(doc.id, update("keep me"));
    client.send("document.update", message);
    expect(await client.closed).toBe(CLOSE_CODES.tryAgain);
    expect(client.messages.some((m) => m.type === "document.ack")).toBe(false);
    spy.mockRestore();

    const again = connect(instances[0]!, doc.id, sid);
    await again.waitFor("document.snapshot");
    again.send("document.update", message);
    expect((await again.waitFor("document.ack")).payload.version).toBe(1);
  });
});
