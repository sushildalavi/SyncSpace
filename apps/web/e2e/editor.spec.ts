import { expect, test } from "@playwright/test";
import * as Y from "yjs";

function encodeYText(value: string): string {
  const doc = new Y.Doc();
  doc.getText("body").insert(0, value);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const sockets: Array<any> = [];
    class MockSocket {
      static OPEN = 1;
      readyState = 0;
      sent: string[] = [];
      private listeners = new Map<string, Array<(event: Event) => void>>();
      private openHandler: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(public url: string) {
        Object.defineProperty(this, "onopen", {
          configurable: true,
          enumerable: true,
          get: () => this.openHandler,
          set: (handler: ((event: Event) => void) | null) => {
            this.openHandler = handler;
            if (this.readyState === MockSocket.OPEN && handler) {
              queueMicrotask(() => handler(new Event("open")));
            }
          }
        });
        sockets.push(this);
        setTimeout(() => {
          this.readyState = MockSocket.OPEN;
          this.openHandler?.(new Event("open"));
          this.dispatchEvent(new Event("open"));
        }, 0);
      }

      send(message: string) {
        this.sent.push(message);
      }

      addEventListener(type: string, handler: (event: Event) => void) {
        const current = this.listeners.get(type) ?? [];
        current.push(handler);
        this.listeners.set(type, current);
        if (type === "open" && this.readyState === MockSocket.OPEN) {
          queueMicrotask(() => handler(new Event("open")));
        }
      }

      removeEventListener(type: string, handler: (event: Event) => void) {
        const current = this.listeners.get(type) ?? [];
        this.listeners.set(
          type,
          current.filter((candidate) => candidate !== handler)
        );
      }

      dispatchEvent(event: Event) {
        for (const handler of this.listeners.get(event.type) ?? []) {
          handler(event);
        }
        return true;
      }

      close() {
        this.readyState = 3;
        this.onclose?.(new CloseEvent("close"));
      }

      receive(payload: unknown) {
        this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(payload) }));
      }
    }

    (window as Window & { __syncspaceSockets?: Array<any> }).__syncspaceSockets = sockets;
    (window as Window & { WebSocket: typeof WebSocket }).WebSocket = MockSocket as unknown as typeof WebSocket;
    window.localStorage.setItem(
      "syncspace-token",
      "test-token"
    );
    window.localStorage.setItem(
      "syncspace-user",
      JSON.stringify({ id: "user-1", email: "user@example.com", displayName: "User One" })
    );
  });

  await page.route("http://127.0.0.1:3001/documents/doc-1", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        _id: "doc-1",
        title: "Design Draft",
        workspaceId: "workspace-1",
        currentVersion: 1
      })
    });
  });

  await page.route("http://127.0.0.1:3001/documents/doc-1/versions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        document: {
          _id: "doc-1",
          title: "Design Draft",
          workspaceId: "workspace-1",
          currentVersion: 1
        },
        snapshots: [
          {
            _id: "snapshot-1",
            version: 1,
            createdAt: new Date().toISOString()
          }
        ],
        updates: []
      })
    });
  });
});

test("loads a document, connects, and reflects collaborative updates", async ({ page }) => {
  await page.goto("/documents/doc-1");

  await expect(page.getByText("Collaborative editor")).toBeVisible();
  await expect(page.getByRole("textbox")).toBeVisible();

  await page.waitForFunction(
    () => Boolean((window as Window & { __syncspaceSocket?: any }).__syncspaceSocket?.url?.includes("/collaboration"))
  );
  await page.evaluate(() => {
    const socket =
      (window as Window & { __syncspaceSocket?: any }).__syncspaceSocket ??
      (window as Window & { __syncspaceSockets?: Array<any> }).__syncspaceSockets?.find((candidate) =>
        typeof candidate.url === "string" && candidate.url.includes("/collaboration")
      );
    socket?.dispatchEvent(new Event("open"));
    socket?.onopen?.(new Event("open"));
  });

  await expect(page.getByText("connected")).toBeVisible();

  await page.evaluate((snapshot) => {
    const socket =
      (window as Window & { __syncspaceSocket?: any }).__syncspaceSocket ??
      (window as Window & { __syncspaceSockets?: Array<any> }).__syncspaceSockets?.find((candidate) =>
        typeof candidate.url === "string" && candidate.url.includes("/collaboration")
      );
    socket?.receive({
      type: "document.snapshot",
      payload: {
        documentId: "doc-1",
        version: 1,
        snapshot
      }
    });
  }, encodeYText("Hello from snapshot"));

  await expect(page.getByRole("textbox")).toHaveValue("Hello from snapshot");

  await page.getByRole("textbox").fill("Hello from the browser");

  const sentCount = await page.evaluate(() => {
    const socket =
      (window as Window & { __syncspaceSocket?: any }).__syncspaceSocket ??
      (window as Window & { __syncspaceSockets?: Array<any> }).__syncspaceSockets?.find((candidate) =>
        typeof candidate.url === "string" && candidate.url.includes("/collaboration")
      );
    return socket?.sent.length ?? 0;
  });

  expect(sentCount).toBeGreaterThan(0);

  await page.evaluate((payload) => {
    const socket =
      (window as Window & { __syncspaceSocket?: any }).__syncspaceSocket ??
      (window as Window & { __syncspaceSockets?: Array<any> }).__syncspaceSockets?.find((candidate) =>
        typeof candidate.url === "string" && candidate.url.includes("/collaboration")
      );
    socket?.receive({
      type: "document.update",
      payload: {
        documentId: "doc-1",
        version: 2,
        payload
      }
    });
  }, encodeYText("Hello from the browser and remote"));

  await expect(page.getByRole("textbox")).toHaveValue("Hello from the browserHello from the browser and remote");
});
