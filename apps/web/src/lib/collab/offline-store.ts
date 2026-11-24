import { openDB, type IDBPDatabase } from "idb";

export type PendingUpdate = { updateId: string; payload: string; createdAt: number };

/**
 * Durable queue of local updates the server hasn't acknowledged yet, so edits survive a
 * reload while offline. Falls back to memory where IndexedDB is unavailable.
 */
export class OfflineStore {
  private db: Promise<IDBPDatabase | null>;
  private readonly memory = new Map<string, PendingUpdate>();

  constructor(private readonly documentId: string) {
    this.db =
      typeof indexedDB === "undefined"
        ? Promise.resolve(null)
        : openDB("syncspace-offline", 2, {
            upgrade(db) {
              if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending");
            }
          }).catch(() => null);
  }

  private key(updateId: string): string {
    return `${this.documentId}:${updateId}`;
  }

  async put(update: PendingUpdate): Promise<void> {
    this.memory.set(update.updateId, update);
    const db = await this.db;
    await db?.put("pending", { ...update, documentId: this.documentId }, this.key(update.updateId)).catch(() => undefined);
  }

  async remove(updateId: string): Promise<void> {
    this.memory.delete(updateId);
    const db = await this.db;
    await db?.delete("pending", this.key(updateId)).catch(() => undefined);
  }

  async loadAll(): Promise<PendingUpdate[]> {
    const db = await this.db;
    if (!db) return [...this.memory.values()];
    const range = IDBKeyRange.bound(`${this.documentId}:`, `${this.documentId}:￿`);
    const rows = (await db.getAll("pending", range).catch(() => [])) as Array<PendingUpdate & { documentId: string }>;
    return rows.sort((a, b) => a.createdAt - b.createdAt).map(({ updateId, payload, createdAt }) => ({ updateId, payload, createdAt }));
  }
}
