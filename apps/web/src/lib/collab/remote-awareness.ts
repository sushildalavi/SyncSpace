import { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

/**
 * y-protocols Awareness whose remote states come from the server rather than from peers.
 * The server stamps identity on every state, so a client can't impersonate another user.
 * Tiptap's caret extension and y-prosemirror's cursor plugin consume this unchanged.
 */
export class RemoteAwareness extends Awareness {
  constructor(doc: Y.Doc) {
    super(doc);
  }

  setRemote(id: number, state: Record<string, unknown> | null): void {
    const existed = this.states.has(id);
    if (state === null) {
      if (!existed) return;
      this.states.delete(id);
      this.meta.delete(id);
      const change = { added: [], updated: [], removed: [id] };
      this.emit("change", [change, "remote"]);
      this.emit("update", [change, "remote"]);
      return;
    }
    this.states.set(id, state);
    this.meta.set(id, { clock: (this.meta.get(id)?.clock ?? 0) + 1, lastUpdated: Date.now() });
    const change = { added: existed ? [] : [id], updated: existed ? [id] : [], removed: [] };
    this.emit("change", [change, "remote"]);
    this.emit("update", [change, "remote"]);
  }
}

/** Stable positive 31-bit id for a server connection id. */
export function numericId(connectionId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < connectionId.length; index += 1) {
    hash ^= connectionId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}
