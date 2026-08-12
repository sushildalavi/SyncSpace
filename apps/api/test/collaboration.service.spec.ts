import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import * as Y from "yjs";

vi.mock("../src/shared/app-env.js", () => ({
  APP_ENV: Symbol("APP_ENV")
}));

import { CollaborationService } from "../src/collaboration/collaboration.service.js";

function createMockWebSocket() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    readyState: 1,
    sent: [] as string[],
    close: vi.fn(),
    send(message: string) {
      this.sent.push(message);
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    emit(event: string, ...args: unknown[]) {
      for (const handler of handlers.get(event) ?? []) {
        handler(...args);
      }
    }
  };
}

describe("CollaborationService", () => {
  it("authenticates the socket and normalizes update identity on the server", async () => {
    const secret = "x".repeat(32);
    const persistUpdate = vi.fn().mockResolvedValue({ record: { _id: "update-1" }, duplicate: false });
    const snapshotIfNeeded = vi.fn().mockResolvedValue(false);
    const documentsService = {
      getDocument: vi.fn().mockResolvedValue({ workspaceId: "workspace-1" }),
      loadDocumentStateWithoutAuth: vi.fn().mockResolvedValue({
        doc: new Y.Doc(),
        document: { currentVersion: 1 }
      }),
      persistUpdate,
      snapshotIfNeeded
    };
    const database = {
      models: {
        memberships: {
          findOne: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue({ workspaceId: "workspace-1", userId: "user-1", role: "editor" })
          })
        }
      }
    } as any;
    const redis = {
      connect: vi.fn(),
      removePresence: vi.fn(),
      publishPresence: vi.fn(),
      xadd: vi.fn().mockResolvedValue("1-0"),
      commands: {
        xgroup: vi.fn().mockResolvedValue(undefined),
        xreadgroup: vi.fn().mockResolvedValue(null),
        xack: vi.fn().mockResolvedValue(1)
      }
    } as any;

    const service = new CollaborationService(database, documentsService as any, redis, {
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: secret
    });

    const token = jwt.sign(
      { id: "user-1", email: "user@example.com", displayName: "User One" },
      secret,
      { expiresIn: "1h" }
    );
    const client = createMockWebSocket();
    const request = {
      url: `/collaboration?token=${encodeURIComponent(token)}&documentId=document-1&clientId=client-1`
    } as any;

    await service.handleConnection(client as any, request);

    expect(client.sent.some((message) => message.includes("document.snapshot"))).toBe(true);
    expect(client.sent.some((message) => message.includes("presence.update"))).toBe(true);

    const updateDoc = new Y.Doc();
    updateDoc.getText("body").insert(0, "hello world");
    const update = Y.encodeStateAsUpdate(updateDoc);

    await service.handleClientMessage(
      client as any,
      JSON.stringify({
        type: "document.update",
        payload: {
          eventId: "evt-1",
          documentId: "document-1",
          clientId: "client-1",
          updateId: "update-1",
          version: 2,
          baseVersion: 1,
          payload: Buffer.from(update).toString("base64")
        }
      })
    );

    expect(persistUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "document-1",
        workspaceId: "workspace-1",
        actorId: "user-1",
        clientId: "client-1",
        updateId: "update-1"
      })
    );
    expect(snapshotIfNeeded).toHaveBeenCalledWith("document-1");
  });
});
