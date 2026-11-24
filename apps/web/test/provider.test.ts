import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { CLOSE_CODES } from "@syncspace/contracts";
import { CollabProvider } from "../src/lib/collab/provider";

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 1;
  sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const emptySnapshot = (version = 0) => ({ type: "document.snapshot", payload: { documentId: "d", version, snapshot: b64(Y.encodeStateAsUpdate(new Y.Doc())), role: "editor", connectionId: "c1" } });
const updatesSent = (socket: FakeSocket) => socket.sent.filter((m) => m.type === "document.update");

function makeProvider() {
  const doc = new Y.Doc();
  const provider = new CollabProvider({ documentId: "d", baseUrl: "ws://x", doc, user: { name: "Ada", color: "#000" } });
  return { doc, provider };
}
const nextSocket = async (count: number) => {
  await vi.waitFor(() => expect(FakeSocket.instances.length).toBe(count), { timeout: 4000 });
  return FakeSocket.instances[count - 1]!;
};

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", { hidden: false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CollabProvider", () => {
  it("replays a large unacknowledged backlog as ONE merged update, not hundreds of messages", async () => {
    const { doc, provider } = makeProvider();
    const first = await nextSocket(1);
    first.onopen?.();
    first.receive(emptySnapshot());
    for (let i = 0; i < 6; i += 1) {
      doc.getText("body").insert(doc.getText("body").length, `edit${i} `);
      await new Promise((resolve) => setTimeout(resolve, 70)); // each lands as its own batch
    }
    expect(updatesSent(first)).toHaveLength(6);
    expect(provider.getStatus().pending).toBe(6);

    first.drop(1006); // connection lost before any ack
    const second = await nextSocket(2);
    second.onopen?.();
    second.receive(emptySnapshot());

    const replayed = updatesSent(second);
    expect(replayed).toHaveLength(1);
    expect(provider.getStatus().pending).toBe(1);
    const rebuilt = new Y.Doc();
    Y.applyUpdate(rebuilt, Buffer.from(String(replayed[0]!.payload.payload), "base64"));
    expect(rebuilt.getText("body").toString()).toBe("edit0 edit1 edit2 edit3 edit4 edit5 ");

    // once acknowledged, the queue is empty and "Saved" is reportable
    second.receive({ type: "document.ack", payload: { updateId: replayed[0]!.payload.updateId, version: 1 } });
    expect(provider.getStatus().pending).toBe(0);
    provider.destroy();
  });

  it("asks for a resync after two consecutive sync checks show it is behind, and not for an in-flight update", async () => {
    const { provider } = makeProvider();
    const socket = await nextSocket(1);
    socket.onopen?.();
    socket.receive(emptySnapshot(3));
    const requests = () => socket.sent.filter((m) => m.type === "sync.request").length;
    const update = (version: number) => ({ type: "document.update", payload: { documentId: "d", updateId: `u${version}`, version, payload: b64(Y.encodeStateAsUpdate(new Y.Doc())), actorId: "x" } });

    socket.receive({ type: "sync.check", payload: { documentId: "d", version: 3 } }); // up to date
    socket.receive({ type: "sync.check", payload: { documentId: "d", version: 4 } }); // behind once: could be in flight
    expect(requests()).toBe(0);
    socket.receive(update(4)); // it arrives
    socket.receive({ type: "sync.check", payload: { documentId: "d", version: 4 } });
    socket.receive({ type: "sync.check", payload: { documentId: "d", version: 4 } });
    expect(requests()).toBe(0);

    socket.receive({ type: "sync.check", payload: { documentId: "d", version: 5 } });
    socket.receive({ type: "sync.check", payload: { documentId: "d", version: 5 } }); // behind twice with nothing arriving
    expect(requests()).toBe(1);
    provider.destroy();
  });

  it("detects a GAP even though later updates keep arriving (tracking the maximum would hide it)", async () => {
    const { provider } = makeProvider();
    const socket = await nextSocket(1);
    socket.onopen?.();
    socket.receive(emptySnapshot(3));
    const update = (version: number) => ({ type: "document.update", payload: { documentId: "d", updateId: `u${version}`, version, payload: b64(Y.encodeStateAsUpdate(new Y.Doc())), actorId: "x" } });
    // versions 4 and 5 were lost on the bus. 6, 7 and 8 come from a writer on this same instance.
    socket.receive(update(6));
    socket.receive(update(7));
    socket.receive(update(8));
    socket.receive({ type: "sync.check", payload: { documentId: "d", version: 8 } });
    expect(socket.sent.filter((m) => m.type === "sync.request")).toHaveLength(0);
    socket.receive({ type: "sync.check", payload: { documentId: "d", version: 8 } });
    expect(socket.sent.filter((m) => m.type === "sync.request")).toHaveLength(1);

    // the resync snapshot closes the gap, so the next checks are quiet
    socket.receive(emptySnapshot(8));
    socket.receive({ type: "sync.check", payload: { documentId: "d", version: 8 } });
    socket.receive({ type: "sync.check", payload: { documentId: "d", version: 8 } });
    expect(socket.sent.filter((m) => m.type === "sync.request")).toHaveLength(1);
    provider.destroy();
  });

  it("applies a resync snapshot without replaying the backlog again", async () => {
    const { doc, provider } = makeProvider();
    const socket = await nextSocket(1);
    socket.onopen?.();
    socket.receive(emptySnapshot());
    doc.getText("body").insert(0, "hello");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(updatesSent(socket)).toHaveLength(1);
    socket.receive(emptySnapshot(5)); // resync on the same socket
    expect(updatesSent(socket)).toHaveLength(1);
    provider.destroy();
  });

  it("backs off after being rate limited instead of reconnecting in a tight loop", async () => {
    vi.useFakeTimers();
    const { provider } = makeProvider();
    await vi.advanceTimersByTimeAsync(10);
    const first = FakeSocket.instances[0]!;
    first.onopen?.();
    first.receive(emptySnapshot());
    first.drop(CLOSE_CODES.rateLimited);
    await vi.advanceTimersByTimeAsync(2500);
    expect(FakeSocket.instances).toHaveLength(1); // still waiting
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeSocket.instances).toHaveLength(2);
    provider.destroy();
  });

  it("does not reconnect after the server says access was removed", async () => {
    vi.useFakeTimers();
    const { provider } = makeProvider();
    await vi.advanceTimersByTimeAsync(10);
    const socket = FakeSocket.instances[0]!;
    socket.onopen?.();
    socket.receive(emptySnapshot());
    socket.drop(CLOSE_CODES.accessRevoked);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(provider.getStatus()).toMatchObject({ connection: "closed", closedCode: CLOSE_CODES.accessRevoked });
    provider.destroy();
  });
});
