import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { and, eq, gt, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocket } from "ws";
import * as Y from "yjs";
import {
  CLOSE_CODES,
  COLLAB_LIMITS,
  CollaborationUpdateSchema,
  PresenceUpdateSchema,
  presenceColorFor,
  roleCan,
  type WorkspaceRole
} from "@syncspace/contracts";
import { AccessService } from "../access/access.service.js";
import { AUTH } from "../auth/auth.constants.js";
import type { Auth } from "../auth/auth.factory.js";
import { resolveSession } from "../auth/session.guard.js";
import { DB, type Db } from "../db/database.module.js";
import { session as sessionTable } from "../db/schema.js";
import { DocumentsService } from "../documents/documents.service.js";
import { RealtimeBus, type BusEnvelope } from "../realtime/realtime-bus.service.js";
import { APP_ENV, type AppEnv } from "../shared/app-env.js";

type Connection = {
  id: string;
  socket: WebSocket;
  userId: string;
  userName: string;
  sessionId: string;
  workspaceId: string;
  documentId: string;
  clientId: string;
  role: WorkspaceRole;
  color: string;
  windowStart: number;
  windowCount: number;
};

const PRESENCE_TTL_MS = 45_000;
const REVALIDATE_EVERY_MS = 15_000;

@Injectable()
export class CollaborationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollaborationService.name);
  private readonly byDocument = new Map<string, Set<Connection>>();
  private readonly bySocket = new Map<WebSocket, Connection>();
  private unsubscribe?: () => void;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
    @Inject(APP_ENV) private readonly env: Pick<AppEnv, "WEB_ORIGIN">
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.bus.subscribe((envelope) => this.onBusEvent(envelope));
    this.timer = setInterval(() => void this.revalidate().catch((error) => this.logger.warn(String(error))), REVALIDATE_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    clearInterval(this.timer);
    for (const connection of this.bySocket.values()) {
      connection.socket.close(1001, "Server shutting down");
    }
  }

  get connectionCount(): number {
    return this.bySocket.size;
  }

  /* ---------------- connection lifecycle ---------------- */

  async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    // Register listeners immediately so nothing sent during async auth is lost.
    const queued: string[] = [];
    let ready: Connection | null = null;
    socket.on("message", (data) => {
      const text = data.toString();
      if (ready) {
        void this.onMessage(ready, text);
      } else {
        queued.push(text);
      }
    });
    socket.on("close", () => this.drop(socket));
    socket.on("error", () => this.drop(socket));

    const connection = await this.authenticate(socket, request);
    if (!connection || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    ready = connection;
    this.bySocket.set(socket, connection);
    const set = this.byDocument.get(connection.documentId) ?? new Set<Connection>();
    set.add(connection);
    this.byDocument.set(connection.documentId, set);

    // Subscribed first, then state is loaded, so no update can fall into the gap. Yjs merges duplicates.
    const state = await this.documents.loadState(connection.documentId);
    this.send(connection, {
      type: "document.snapshot",
      payload: {
        documentId: connection.documentId,
        version: state.version,
        snapshot: Buffer.from(state.update).toString("base64"),
        role: connection.role,
        connectionId: connection.id
      }
    });
    this.send(connection, { type: "presence.sync", payload: { states: await this.readPresence(connection.documentId, connection.id) } });
    for (const text of queued.splice(0)) {
      void this.onMessage(connection, text);
    }
  }

  private async authenticate(socket: WebSocket, request: IncomingMessage): Promise<Connection | null> {
    // Cookie auth means browsers attach credentials to any origin's socket. Check the Origin ourselves.
    const origin = request.headers.origin;
    if (!origin || new URL(this.env.WEB_ORIGIN).origin !== origin) {
      socket.close(CLOSE_CODES.forbidden, "Origin not allowed");
      return null;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    const documentId = url.searchParams.get("documentId") ?? "";
    const clientId = (url.searchParams.get("clientId") ?? randomUUID()).slice(0, 64);

    const session = await resolveSession(this.auth, request.headers).catch(() => null);
    if (!session) {
      socket.close(CLOSE_CODES.unauthenticated, "Sign in to collaborate");
      return null;
    }
    try {
      const { document, role } = await this.access.requireDocument(documentId, session.user.id, "document.read");
      return {
        id: randomUUID(),
        socket,
        userId: session.user.id,
        userName: session.user.name,
        sessionId: session.sessionId,
        workspaceId: document.workspaceId,
        documentId,
        clientId,
        role,
        color: presenceColorFor(session.user.id),
        windowStart: Date.now(),
        windowCount: 0
      };
    } catch {
      socket.close(CLOSE_CODES.notFound, "Document not found or access denied");
      return null;
    }
  }

  private drop(socket: WebSocket): void {
    const connection = this.bySocket.get(socket);
    if (!connection) {
      return;
    }
    this.bySocket.delete(socket);
    const set = this.byDocument.get(connection.documentId);
    set?.delete(connection);
    if (set?.size === 0) {
      this.byDocument.delete(connection.documentId);
    }
    void this.bus.redis.hdel(this.presenceKey(connection.documentId), connection.id).catch(() => undefined);
    this.broadcastLocal(connection.documentId, { type: "presence.leave", payload: { connectionId: connection.id } });
    void this.bus
      .publish({ type: "presence.leave", documentId: connection.documentId, connectionId: connection.id })
      .catch(() => undefined);
  }

  /* ---------------- inbound messages ---------------- */

  async onMessage(connection: Connection, raw: string): Promise<void> {
    if (!this.withinRateLimit(connection)) {
      connection.socket.close(CLOSE_CODES.rateLimited, "Too many messages");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.send(connection, { type: "error", message: "Invalid JSON payload" });
      return;
    }
    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { type?: unknown }).type !== "string") {
      this.send(connection, { type: "error", message: "Invalid message envelope" });
      return;
    }
    const { type, payload } = parsed as { type: string; payload?: unknown };
    try {
      if (type === "document.update") {
        await this.onDocumentUpdate(connection, payload);
      } else if (type === "presence.update") {
        await this.onPresenceUpdate(connection, payload);
      }
    } catch (error) {
      this.logger.error(`message handling failed: ${String(error)}`);
      this.send(connection, { type: "error", message: "Something went wrong handling that message" });
    }
  }

  private withinRateLimit(connection: Connection): boolean {
    const now = Date.now();
    if (now - connection.windowStart >= 1000) {
      connection.windowStart = now;
      connection.windowCount = 0;
    }
    connection.windowCount += 1;
    return connection.windowCount <= COLLAB_LIMITS.maxMessagesPerSecond;
  }

  private async onDocumentUpdate(connection: Connection, payload: unknown): Promise<void> {
    const parsed = CollaborationUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      this.send(connection, { type: "error", message: "Invalid collaboration update" });
      return;
    }
    const update = parsed.data;
    if (update.documentId !== connection.documentId) {
      this.send(connection, { type: "document.rejected", payload: { updateId: update.updateId, reason: "wrong_document" } });
      return;
    }

    // Authorization is re-read from the database for every write, so a viewer, or a member
    // who was just removed, can never persist an update through an already-open socket.
    const role = await this.access.getRole(connection.workspaceId, connection.userId);
    if (!role) {
      this.revoke(connection, CLOSE_CODES.accessRevoked, "Access to this workspace was removed");
      return;
    }
    connection.role = role;
    if (!roleCan(role, "document.write")) {
      this.send(connection, { type: "document.rejected", payload: { updateId: update.updateId, reason: "read_only" } });
      return;
    }

    const bytes = Buffer.from(update.payload, "base64");
    try {
      Y.applyUpdate(new Y.Doc(), bytes);
    } catch {
      this.send(connection, { type: "document.rejected", payload: { updateId: update.updateId, reason: "malformed" } });
      return;
    }

    const result = await this.documents.persistUpdate({
      documentId: connection.documentId,
      actorId: connection.userId,
      clientId: connection.clientId,
      updateId: update.updateId,
      payload: bytes,
      sourceInstanceId: this.bus.instanceId
    });
    this.send(connection, { type: "document.ack", payload: { updateId: update.updateId, version: result.version, duplicate: result.duplicate } });
    if (result.duplicate) {
      return;
    }

    const outbound = {
      documentId: connection.documentId,
      updateId: update.updateId,
      version: result.version,
      payload: update.payload,
      actorId: connection.userId
    };
    this.broadcastLocal(connection.documentId, { type: "document.update", payload: outbound }, connection);
    await this.bus.publish({ type: "document.update", connectionId: connection.id, ...outbound });
    void this.documents.snapshotIfNeeded(connection.documentId).catch((error) => this.logger.warn(`snapshot failed: ${String(error)}`));
  }

  private async onPresenceUpdate(connection: Connection, payload: unknown): Promise<void> {
    const parsed = PresenceUpdateSchema.safeParse(payload);
    if (!parsed.success || JSON.stringify(parsed.data.cursor ?? {}).length > 2000) {
      return;
    }
    // Identity always comes from the authenticated session, never from the client.
    const state = {
      connectionId: connection.id,
      userId: connection.userId,
      userName: connection.userName,
      color: connection.color,
      status: parsed.data.status,
      cursor: parsed.data.cursor,
      expiresAt: Date.now() + PRESENCE_TTL_MS
    };
    const key = this.presenceKey(connection.documentId);
    await this.bus.redis.hset(key, connection.id, JSON.stringify(state));
    await this.bus.redis.pexpire(key, PRESENCE_TTL_MS * 3);
    this.broadcastLocal(connection.documentId, { type: "presence.state", payload: state }, connection);
    await this.bus.publish({ type: "presence.state", documentId: connection.documentId, connectionId: connection.id, state });
  }

  private presenceKey(documentId: string): string {
    return `syncspace:presence:${documentId}`;
  }

  private async readPresence(documentId: string, excludeConnectionId: string): Promise<unknown[]> {
    const all = await this.bus.redis.hgetall(this.presenceKey(documentId));
    const now = Date.now();
    const live: unknown[] = [];
    const expired: string[] = [];
    for (const [connectionId, value] of Object.entries(all)) {
      try {
        const state = JSON.parse(value) as { expiresAt: number };
        if (state.expiresAt < now) {
          expired.push(connectionId);
        } else if (connectionId !== excludeConnectionId) {
          live.push(state);
        }
      } catch {
        expired.push(connectionId);
      }
    }
    if (expired.length > 0) {
      await this.bus.redis.hdel(this.presenceKey(documentId), ...expired);
    }
    return live;
  }

  /* ---------------- fan-out from other instances ---------------- */

  private onBusEvent({ instanceId, event }: BusEnvelope): void {
    const remote = instanceId !== this.bus.instanceId;
    switch (event.type) {
      case "document.update":
        if (remote) {
          this.broadcastLocal(event.documentId, {
            type: "document.update",
            payload: { documentId: event.documentId, updateId: event.updateId, version: event.version, payload: event.payload, actorId: event.actorId }
          });
        }
        return;
      case "presence.state":
        if (remote) {
          this.broadcastLocal(event.documentId, { type: "presence.state", payload: event.state });
        }
        return;
      case "presence.leave":
        if (remote) {
          this.broadcastLocal(event.documentId, { type: "presence.leave", payload: { connectionId: event.connectionId } });
        }
        return;
      case "access.changed":
        for (const connection of [...this.bySocket.values()]) {
          if (connection.workspaceId !== event.workspaceId || connection.userId !== event.userId) {
            continue;
          }
          if (event.role === null) {
            this.revoke(connection, CLOSE_CODES.accessRevoked, "Access to this workspace was removed");
          } else if (event.role !== connection.role) {
            connection.role = event.role;
            this.send(connection, { type: "access.updated", payload: { role: event.role } });
          }
        }
        return;
      case "session.revoked":
        for (const connection of [...this.bySocket.values()]) {
          if (connection.sessionId === event.sessionId) {
            this.revoke(connection, CLOSE_CODES.sessionRevoked, "Your session was signed out");
          }
        }
        return;
      case "document.deleted":
        for (const connection of [...(this.byDocument.get(event.documentId) ?? [])]) {
          this.revoke(connection, CLOSE_CODES.notFound, "This document was deleted");
        }
        return;
    }
  }

  /**
   * Safety net for events that never reach the bus (an instance restart, a bulk session delete):
   * every open socket is periodically checked against the database.
   */
  async revalidate(): Promise<void> {
    const connections = [...this.bySocket.values()];
    if (connections.length === 0) {
      return;
    }
    const sessionIds = [...new Set(connections.map((connection) => connection.sessionId))];
    const live = await this.db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(and(inArray(sessionTable.id, sessionIds), gt(sessionTable.expiresAt, new Date())));
    const liveIds = new Set(live.map((row) => row.id));
    const roleCache = new Map<string, WorkspaceRole | null>();
    for (const connection of connections) {
      if (!liveIds.has(connection.sessionId)) {
        this.revoke(connection, CLOSE_CODES.sessionRevoked, "Your session has ended");
        continue;
      }
      const cacheKey = `${connection.workspaceId}:${connection.userId}`;
      if (!roleCache.has(cacheKey)) {
        roleCache.set(cacheKey, await this.access.getRole(connection.workspaceId, connection.userId));
      }
      const role = roleCache.get(cacheKey) ?? null;
      if (!role) {
        this.revoke(connection, CLOSE_CODES.accessRevoked, "Access to this workspace was removed");
      } else if (role !== connection.role) {
        connection.role = role;
        this.send(connection, { type: "access.updated", payload: { role } });
      }
    }
  }

  /* ---------------- helpers ---------------- */

  private revoke(connection: Connection, code: number, reason: string): void {
    this.send(connection, { type: "access.revoked", payload: { code, reason } });
    connection.socket.close(code, reason);
    this.drop(connection.socket);
  }

  private send(connection: Connection, message: unknown): void {
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  private broadcastLocal(documentId: string, message: unknown, exclude?: Connection): void {
    const set = this.byDocument.get(documentId);
    if (!set) {
      return;
    }
    const serialized = JSON.stringify(message);
    for (const connection of set) {
      if (connection !== exclude && connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(serialized);
      }
    }
  }
}
