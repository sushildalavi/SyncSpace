import * as Y from "yjs";
import { CLOSE_CODES, COLLAB_LIMITS, type WorkspaceRole } from "@syncspace/contracts";
import { OfflineStore, type PendingUpdate } from "./offline-store";
import { numericId, RemoteAwareness } from "./remote-awareness";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline" | "closed";

export type CollabStatus = {
  connection: ConnectionState;
  /** Set once the server ended the session (access removed, signed out, document deleted). */
  closedReason: string | null;
  closedCode: number | null;
  /** True once the current socket delivered the document state. */
  synced: boolean;
  role: WorkspaceRole | null;
  /** Local updates not yet acknowledged by the server. */
  pending: number;
  lastSavedAt: number | null;
  /** Edits were refused because this connection is read-only. */
  editsRejected: boolean;
};

type Listener = () => void;
type Json = Record<string, unknown>;

const TERMINAL: Record<number, string> = {
  [CLOSE_CODES.unauthenticated]: "You've been signed out. Sign in again to keep editing.",
  [CLOSE_CODES.forbidden]: "This connection isn't allowed.",
  [CLOSE_CODES.notFound]: "This document was deleted or you no longer have access to it.",
  [CLOSE_CODES.accessRevoked]: "Your access to this document was removed.",
  [CLOSE_CODES.sessionRevoked]: "This session was signed out from another device."
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};
const fromBase64 = (value: string): Uint8Array => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

/**
 * Connects a Y.Doc to the SyncSpace collaboration socket.
 *
 * - Sends incremental updates (never full state) batched over ~50 ms.
 * - Keeps every unacknowledged update in IndexedDB and replays it after reconnecting.
 * - "Saved" means the server acknowledged persistence, not that the socket is open.
 * - Reconnects with jittered exponential backoff, except when the server says access is gone.
 */
export class CollabProvider {
  readonly awareness: RemoteAwareness;
  private socket: WebSocket | null = null;
  private readonly store: OfflineStore;
  private readonly pending = new Map<string, PendingUpdate>();
  private outbox: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private connectedAt = 0;
  /**
   * Highest version N such that this client has seen every version up to N (snapshot, remote update or ack).
   * Tracking the maximum would be wrong: later updates arriving normally would hide a gap left by lost events.
   */
  private contiguous = 0;
  private ahead = new Set<number>();
  private behindChecks = 0;
  private destroyed = false;
  private readonly listeners = new Set<Listener>();
  private readonly clientId = crypto.randomUUID();
  private connectionId: string | null = null;
  private readonly remoteIds = new Map<string, number>();
  private restored: Promise<void>;
  private status: CollabStatus = {
    connection: "connecting",
    closedReason: null,
    closedCode: null,
    synced: false,
    role: null,
    pending: 0,
    lastSavedAt: null,
    editsRejected: false
  };

  constructor(
    private readonly options: { documentId: string; baseUrl: string; doc: Y.Doc; user: { name: string; color: string } }
  ) {
    this.awareness = new RemoteAwareness(options.doc);
    this.awareness.setLocalStateField("user", options.user);
    this.store = new OfflineStore(options.documentId);
    options.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    window.addEventListener("pagehide", this.onPageHide);
    this.restored = this.restorePending();
    void this.restored.then(() => this.connect());
  }

  /* ---------- external store plumbing ---------- */

  getStatus = (): CollabStatus => this.status;
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private patch(next: Partial<CollabStatus>): void {
    this.status = { ...this.status, ...next };
    this.listeners.forEach((listener) => listener());
  }

  /* ---------- local edits ---------- */

  private onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this || this.destroyed) return;
    this.outbox.push(update);
    // Count it at once: until the batch is sent and acknowledged, this edit is not saved.
    if (this.status.pending !== this.unsaved()) this.patch({ pending: this.unsaved() });
    this.flushTimer ??= setTimeout(() => void this.flush(), 50);
  };

  /** Edits the server hasn't confirmed, including a batch that is still being collected. */
  private unsaved(): number {
    return this.pending.size + (this.outbox.length > 0 ? 1 : 0);
  }

  private noteVersion(version: number): void {
    if (!Number.isFinite(version) || version <= this.contiguous) return;
    this.ahead.add(version);
    while (this.ahead.delete(this.contiguous + 1)) this.contiguous += 1;
  }

  /** Turns the collected edits into one queued update. */
  private takeBatch(): PendingUpdate | null {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.outbox.length === 0) return null;
    const merged = Y.mergeUpdates(this.outbox);
    this.outbox = [];
    const entry: PendingUpdate = { updateId: crypto.randomUUID(), payload: toBase64(merged), createdAt: Date.now() };
    this.pending.set(entry.updateId, entry);
    return entry;
  }

  private async flush(): Promise<void> {
    const entry = this.takeBatch();
    if (!entry) return;
    this.patch({ pending: this.unsaved() });
    await this.store.put(entry);
    this.transmit(entry);
  }

  /** The tab is closing or the editor is going away: don't wait for the batch timer. */
  private flushNow(): void {
    const entry = this.takeBatch();
    if (!entry) return;
    void this.store.put(entry);
    this.transmit(entry);
  }

  private onPageHide = (): void => this.flushNow();

  private transmit(entry: PendingUpdate): void {
    if (entry.payload.length > COLLAB_LIMITS.maxUpdateChars) {
      // A single edit this big (a huge paste) can never be accepted. Say so, rather than showing "Saving…" forever.
      this.pending.delete(entry.updateId);
      void this.store.remove(entry.updateId);
      this.patch({ pending: this.unsaved(), editsRejected: true });
      return;
    }
    if (this.socket?.readyState === WebSocket.OPEN && this.status.synced && this.status.role !== "viewer") {
      this.socket.send(JSON.stringify({ type: "document.update", payload: { documentId: this.options.documentId, updateId: entry.updateId, payload: entry.payload } }));
    }
  }

  /**
   * Re-sends everything the server hasn't acknowledged. After a long outage the backlog can be hundreds of updates;
   * sent one by one it would exceed the server's message rate limit, get the socket closed, and loop. Yjs updates merge,
   * and applying an update twice is a no-op, so the backlog goes up merged, even if some of it had in fact been
   * persisted before the connection dropped. A backlog too large for one message is split into as few as will fit.
   */
  private replayPending(): void {
    const groups: PendingUpdate[][] = [];
    let size = 0;
    for (const entry of this.pending.values()) {
      // merging never makes updates meaningfully larger than their sum
      if (groups.length === 0 || size + entry.payload.length > COLLAB_LIMITS.maxUpdateChars) {
        groups.push([]);
        size = 0;
      }
      groups.at(-1)!.push(entry);
      size += entry.payload.length;
    }
    for (const group of groups) {
      if (group.length < 2) continue;
      const merged: PendingUpdate = {
        updateId: crypto.randomUUID(),
        payload: toBase64(Y.mergeUpdates(group.map((entry) => fromBase64(entry.payload)))),
        createdAt: group[0]!.createdAt
      };
      for (const entry of group) {
        this.pending.delete(entry.updateId);
        void this.store.remove(entry.updateId);
      }
      this.pending.set(merged.updateId, merged);
      void this.store.put(merged);
    }
    this.patch({ pending: this.unsaved() });
    for (const entry of [...this.pending.values()].sort((a, b) => a.createdAt - b.createdAt)) this.transmit(entry);
  }

  private async restorePending(): Promise<void> {
    for (const entry of await this.store.loadAll()) {
      this.pending.set(entry.updateId, entry);
      Y.applyUpdate(this.options.doc, fromBase64(entry.payload), this);
    }
    this.patch({ pending: this.pending.size });
  }

  /* ---------- connection ---------- */

  private connect(): void {
    if (this.destroyed || this.status.closedReason) return;
    if (!navigator.onLine) {
      this.patch({ connection: "offline", synced: false });
      return;
    }
    this.patch({ connection: this.attempts === 0 ? "connecting" : "reconnecting" });
    const url = `${this.options.baseUrl}/collaboration?documentId=${encodeURIComponent(this.options.documentId)}&clientId=${this.clientId}`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.connectedAt = Date.now();
      this.patch({ connection: "connected" });
    };
    socket.onmessage = (event) => this.onMessage(String(event.data));
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.onClosed(event.code);
    };
    socket.onerror = () => undefined; // onclose always follows and handles recovery
  }

  private onClosed(code: number): void {
    this.connectionId = null;
    this.remoteIds.forEach((id) => this.awareness.setRemote(id, null));
    this.remoteIds.clear();
    const reason = TERMINAL[code];
    if (reason) {
      this.patch({ connection: "closed", closedReason: reason, closedCode: code, synced: false });
      return;
    }
    this.patch({ connection: navigator.onLine ? "reconnecting" : "offline", synced: false });
    if (!navigator.onLine) return;
    // Only a connection that stayed up for a while counts as healthy. Otherwise a connect-then-drop loop would retry at full speed.
    if (this.connectedAt && Date.now() - this.connectedAt > 10_000) this.attempts = 0;
    this.connectedAt = 0;
    let delay = Math.min(15_000, 500 * 2 ** this.attempts) * (0.6 + Math.random() * 0.4);
    if (code === CLOSE_CODES.rateLimited) delay = Math.max(delay, 3_000);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private onOnline = (): void => {
    if (this.destroyed || this.status.closedReason || this.socket) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.attempts = 0;
    this.connect();
  };

  private onOffline = (): void => {
    if (this.destroyed) return;
    this.patch({ connection: "offline", synced: false });
    this.socket?.close();
  };

  /* ---------- inbound ---------- */

  private onMessage(raw: string): void {
    let message: { type: string; payload?: Json };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const payload = (message.payload ?? {}) as Json;
    switch (message.type) {
      case "document.snapshot": {
        Y.applyUpdate(this.options.doc, fromBase64(String(payload.snapshot)), this);
        this.connectionId = String(payload.connectionId ?? "");
        // A snapshot contains every version up to its own.
        this.contiguous = Math.max(this.contiguous, Number(payload.version) || 0);
        for (const version of this.ahead) if (version <= this.contiguous) this.ahead.delete(version);
        while (this.ahead.delete(this.contiguous + 1)) this.contiguous += 1;
        this.behindChecks = 0;
        const wasSynced = this.status.synced;
        this.patch({ synced: true, role: payload.role as WorkspaceRole, editsRejected: false });
        if (payload.role === "viewer" && this.pending.size > 0) {
          // Queued edits from before this account lost write access can never be saved.
          for (const id of this.pending.keys()) void this.store.remove(id);
          this.pending.clear();
          this.patch({ pending: this.unsaved(), editsRejected: true });
        }
        // A later snapshot on the same socket is a resync, so only the first one replays the backlog.
        if (!wasSynced) this.replayPending();
        this.sendPresence();
        break;
      }
      case "document.update":
        Y.applyUpdate(this.options.doc, fromBase64(String(payload.payload)), this);
        this.noteVersion(Number(payload.version));
        break;
      case "sync.check": {
        // The server broadcasts the latest persisted version. Being behind on two checks in a row (so in-flight events
        // aren't mistaken for loss) means events were dropped somewhere, for example a Redis restart. Ask for the state.
        this.behindChecks = Number(payload.version) > this.contiguous ? this.behindChecks + 1 : 0;
        if (this.behindChecks >= 2) {
          this.behindChecks = 0;
          this.socket?.send(JSON.stringify({ type: "sync.request", payload: {} }));
        }
        break;
      }
      case "document.ack": {
        this.noteVersion(Number(payload.version));
        const id = String(payload.updateId);
        if (this.pending.delete(id)) void this.store.remove(id);
        this.patch({ pending: this.unsaved(), lastSavedAt: Date.now() });
        break;
      }
      case "document.rejected": {
        const id = String(payload.updateId);
        if (this.pending.delete(id)) void this.store.remove(id);
        this.patch({ pending: this.unsaved(), editsRejected: true, ...(payload.reason === "read_only" ? { role: "viewer" as const } : {}) });
        break;
      }
      case "access.updated":
        this.patch({ role: payload.role as WorkspaceRole, ...(payload.role !== "viewer" ? { editsRejected: false } : {}) });
        if (payload.role !== "viewer") for (const entry of this.pending.values()) this.transmit(entry);
        break;
      case "presence.sync":
        for (const state of (payload.states as Json[]) ?? []) this.applyPresence(state);
        break;
      case "presence.state":
        this.applyPresence(payload);
        break;
      case "presence.leave": {
        const id = this.remoteIds.get(String(payload.connectionId));
        if (id !== undefined) {
          this.awareness.setRemote(id, null);
          this.remoteIds.delete(String(payload.connectionId));
        }
        break;
      }
    }
  }

  private applyPresence(state: Json): void {
    const connectionId = String(state.connectionId);
    if (connectionId === this.connectionId) return;
    let id = this.remoteIds.get(connectionId);
    if (id === undefined) {
      id = numericId(connectionId);
      this.remoteIds.set(connectionId, id);
    }
    this.awareness.setRemote(id, {
      user: { name: state.userName, color: state.color, userId: state.userId },
      cursor: state.cursor ?? null,
      status: state.status
    });
  }

  /* ---------- presence out ---------- */

  private onAwarenessUpdate = (_change: unknown, origin: unknown): void => {
    if (origin !== "local") return;
    this.presenceTimer ??= setTimeout(() => {
      this.presenceTimer = null;
      this.sendPresence();
    }, 100);
  };

  private sendPresence(): void {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.status.synced) return;
    const local = this.awareness.getLocalState() as { cursor?: Json | null } | null;
    this.socket.send(JSON.stringify({ type: "presence.update", payload: { status: document.hidden ? "idle" : "active", ...(local?.cursor ? { cursor: local.cursor } : {}) } }));
  }

  /** Remote collaborators other than this tab. */
  remoteUsers(): Array<{ id: number; name: string; color: string; userId: string; status: string }> {
    const result: Array<{ id: number; name: string; color: string; userId: string; status: string }> = [];
    this.awareness.getStates().forEach((state, id) => {
      if (id === this.options.doc.clientID) return;
      const user = (state as { user?: { name?: string; color?: string; userId?: string }; status?: string }).user;
      if (user?.name) result.push({ id, name: user.name, color: user.color ?? "#2563eb", userId: user.userId ?? String(id), status: (state as { status?: string }).status ?? "active" });
    });
    return result;
  }

  destroy(): void {
    this.flushNow(); // leaving the page within the batch window must not drop the last keystrokes
    this.destroyed = true;
    this.options.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    window.removeEventListener("pagehide", this.onPageHide);
    [this.presenceTimer, this.reconnectTimer].forEach((timer) => timer && clearTimeout(timer));
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.close(1000);
    }
    this.awareness.destroy();
    this.listeners.clear();
  }
}
