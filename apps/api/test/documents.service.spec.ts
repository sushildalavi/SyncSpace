import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { DocumentsService } from "../src/documents/documents.service.js";

describe("DocumentsService", () => {
  it("persists updates and deduplicates repeated update ids", async () => {
    const created: Array<{ updateId: string; payload: Buffer }> = [];
    const documentRecord = {
      _id: "document-1",
      workspaceId: "workspace-1",
      currentVersion: 1,
      updatedBy: "user-1",
      save: vi.fn().mockResolvedValue(undefined)
    };
    const database = {
      models: {
        documents: {
          findById: vi.fn().mockResolvedValue(documentRecord)
        },
        updates: {
          create: vi.fn(async (record: { updateId: string; payload: Buffer }) => {
            if (created.some((item) => item.updateId === record.updateId)) {
              throw new Error("duplicate key error");
            }
            created.push(record);
            return record;
          }),
          countDocuments: vi.fn().mockResolvedValue(1),
          find: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([])
            })
          })
        },
        snapshots: {
          find: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([])
            })
          })
        }
      }
    } as any;

    const workspacesService = {
      requireMembership: vi.fn().mockResolvedValue({ role: "editor" })
    } as any;

    const service = new DocumentsService(database, workspacesService);
    const updateDoc = new Y.Doc();
    updateDoc.getText("body").insert(0, "hello");
    const update = Y.encodeStateAsUpdate(updateDoc);

    const first = await service.persistUpdate({
      documentId: "document-1",
      workspaceId: "workspace-1",
      actorId: "user-1",
      clientId: "client-1",
      updateId: "update-1",
      baseVersion: 1,
      version: 2,
      payload: update,
      sourceInstanceId: "instance-1"
    });

    const second = await service.persistUpdate({
      documentId: "document-1",
      workspaceId: "workspace-1",
      actorId: "user-1",
      clientId: "client-1",
      updateId: "update-1",
      baseVersion: 1,
      version: 2,
      payload: update,
      sourceInstanceId: "instance-1"
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(documentRecord.save).toHaveBeenCalled();
  });
});
