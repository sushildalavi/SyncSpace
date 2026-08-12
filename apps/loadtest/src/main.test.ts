import { describe, expect, it, vi } from "vitest";

class MockSocket {
  static OPEN = 1;
  static instances: MockSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(public readonly url: string) {
    MockSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockSocket.OPEN;
      this.emit("open");
    });
  }

  once(event: string, handler: (...args: unknown[]) => void) {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  emit(event: string, ...args: unknown[]) {
    for (const handler of this.listeners.get(event) ?? []) {
      handler(...args);
    }
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {}
}

vi.mock("ws", () => ({
  default: MockSocket
}));

describe("runLoadTest", () => {
  it("opens one socket per requested client and sends the configured updates", async () => {
    const { runLoadTest } = await import("./main.js");

    await runLoadTest({
      url: "ws://localhost:3001/collaboration",
      documents: ["doc-a", "doc-b"],
      connectionsPerDocument: 2,
      updatesPerClient: 3
    });

    expect(MockSocket.instances).toHaveLength(4);
    expect(MockSocket.instances.every((socket) => socket.sent.length === 3)).toBe(true);
    expect(
      MockSocket.instances.flatMap((socket) => socket.sent).every((message) => message.includes("presence.update"))
    ).toBe(true);
  });
});
