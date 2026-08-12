import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import jwt from "jsonwebtoken";
import * as Y from "yjs";
import { CollaborationUpdateSchema, PresenceUpdateSchema } from "@syncspace/contracts";
import { DatabaseService } from "../database/database.service.js";
import { DocumentsService } from "../documents/documents.service.js";
import { RedisService } from "../redis/redis.service.js";
import { APP_ENV } from "../shared/app-env.js";

type SocketContext = {
  userId: string;
  userName: string;
  documentId: string;
  workspaceId: string;
  clientId: string;
};

type UpdateEnvelope = {
  eventId: string;
  eventType: "document.update";
  sourceInstanceId: string;
  documentId: string;
  workspaceId: string;
  actorId: string;
  clientId: string;
  updateId: string;
  version: number;
  baseVersion: number;
  payload: string;
  createdAt: string;
};

type PresenceEnvelope = {
  eventId: string;
  eventType: "presence.update";
  sourceInstanceId: string;
  documentId: string;
  workspaceId: string;
  userId: string;
  userName: string;
  color: string;
  cursor?: { anchor: number; head: number };
  status: "active" | "idle" | "offline";
  expiresAt: string;
};

@Injectable()
export class CollaborationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollaborationService.name);
  private readonly instanceId = randomUUID();
  private readonly socketsByDocument = new Map<string, Set<WebSocket>>();
  private readonly contexts = new Map<WebSocket, SocketContext>();
  private readonly docs = new Map<string, Y.Doc>();
  private polling = true;

  constructor(
    private readonly database: DatabaseService,
    private readonly documentsService: DocumentsService,
    private readonly redis: RedisService,
    @Inject(APP_ENV) private readonly env: { REDIS_URL: string; JWT_SECRET: string }
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redis.connect();
    void this.consumeDocumentUpdates();
  }

  async onModuleDestroy(): Promise<void> {
    this.polling = false;
  }

  async handleConnection(client: WebSocket, request: IncomingMessage): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    const token = url.searchParams.get("token");
    const documentId = url.searchParams.get("documentId");
    if (!token || !documentId) {
      client.close(1008, "Missing collaboration parameters");
      return;
    }

    let claims: { id: string; email: string; displayName: string };
    try {
      claims = jwt.verify(token, this.env.JWT_SECRET) as { id: string; email: string; displayName: string };
    } catch {
      client.close(1008, "Invalid collaboration token");
      return;
    }

    const userId = claims.id;
    const document = await this.documentsService.getDocument(documentId, userId);
    const workspaceId = document.workspaceId;
    const membership = await this.database.models.memberships.findOne({ workspaceId, userId }).lean();
    if (!membership) {
      client.close(1008, "Workspace access denied");
      return;
    }

    const context: SocketContext = {
      userId,
      userName: claims.displayName,
      documentId,
      workspaceId,
      clientId: url.searchParams.get("clientId") ?? randomUUID()
    };
    this.contexts.set(client, context);
    this.addSocket(documentId, client);

    client.on("message", (data) => void this.handleClientMessage(client, data.toString()));
    client.on("close", () => this.handleDisconnect(client));

    await this.ensureDocumentState(documentId);
    await this.sendSnapshot(client, documentId);
    await this.broadcastPresence(documentId, {
      eventId: randomUUID(),
      eventType: "presence.update",
      sourceInstanceId: this.instanceId,
      documentId,
      workspaceId,
      userId,
      userName: claims.displayName,
      color: "#4f46e5",
      status: "active",
      expiresAt: new Date(Date.now() + 30_000).toISOString()
    });
  }

  handleDisconnect(client: WebSocket): void {
    const context = this.contexts.get(client);
    if (!context) {
      return;
    }
    this.removeSocket(context.documentId, client);
    void this.redis.removePresence(this.presenceKey(context.documentId, context.userId));
    this.contexts.delete(client);
  }

  async handleClientMessage(client: WebSocket, message: string): Promise<void> {
    const context = this.contexts.get(client);
    if (!context) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      client.send(JSON.stringify({ type: "error", message: "Invalid JSON payload" }));
      return;
    }

    if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
      client.send(JSON.stringify({ type: "error", message: "Invalid message envelope" }));
      return;
    }

    const envelope = parsed as { type: string; payload?: unknown };
    if (envelope.type === "document.update") {
      await this.processDocumentUpdate(client, context, envelope.payload);
      return;
    }

    if (envelope.type === "presence.update") {
      await this.processPresenceUpdate(context, envelope.payload);
    }
  }

  private async processDocumentUpdate(client: WebSocket, context: SocketContext, payload: unknown): Promise<void> {
    const parsed = CollaborationUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      client.send(JSON.stringify({ type: "error", message: "Invalid collaboration update" }));
      return;
    }

    const update = parsed.data;
    if (update.documentId !== context.documentId) {
      client.send(JSON.stringify({ type: "error", message: "Document mismatch" }));
      return;
    }
    const buffer = Buffer.from(update.payload, "base64");
    const persistResult = await this.documentsService.persistUpdate({
      documentId: update.documentId,
      workspaceId: context.workspaceId,
      actorId: context.userId,
      clientId: update.clientId,
      updateId: update.updateId,
      baseVersion: update.baseVersion,
      version: update.version,
      payload: buffer,
      sourceInstanceId: this.instanceId
    });

    if (persistResult.duplicate) {
      client.send(JSON.stringify({ type: "document.duplicate", updateId: update.updateId }));
      return;
    }

    const doc = await this.ensureDocumentState(update.documentId);
    Y.applyUpdate(doc, buffer);
    await this.redis.xadd(
      "syncspace:stream:document-updates",
      "MAXLEN",
      "~",
      "20000",
      "*",
      "event",
      JSON.stringify({
        eventId: randomUUID(),
        eventType: "document.update",
        sourceInstanceId: this.instanceId,
        documentId: context.documentId,
        workspaceId: context.workspaceId,
        actorId: context.userId,
        clientId: update.clientId,
        updateId: update.updateId,
        version: update.version,
        baseVersion: update.baseVersion,
        payload: update.payload,
        createdAt: new Date().toISOString()
      } satisfies UpdateEnvelope)
    );

    this.broadcastToDocument(context.documentId, {
      type: "document.update",
      payload: update
    }, client);

    await this.documentsService.snapshotIfNeeded(context.documentId);
  }

  private async processPresenceUpdate(context: SocketContext, payload: unknown): Promise<void> {
    const parsed = PresenceUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }

    const presence = parsed.data;
    const key = this.presenceKey(context.documentId, context.userId);
    const normalizedPresence = {
      ...presence,
      documentId: context.documentId,
      workspaceId: context.workspaceId,
      userId: context.userId,
      userName: context.userName
    };
    await this.redis.publishPresence(key, JSON.stringify(normalizedPresence), 30);
    await this.redis.xadd(
      "syncspace:stream:presence",
      "MAXLEN",
      "~",
      "5000",
      "*",
      "event",
      JSON.stringify({
        eventType: "presence.update",
        sourceInstanceId: this.instanceId,
        ...normalizedPresence,
        eventId: normalizedPresence.eventId
      } satisfies PresenceEnvelope)
    );
    this.broadcastToDocument(context.documentId, { type: "presence.update", payload: normalizedPresence });
  }

  private async consumeDocumentUpdates(): Promise<void> {
    const stream = "syncspace:stream:document-updates";
    const group = "syncspace-api";
    const consumer = this.instanceId;

    try {
      await this.redis.commands.xgroup("CREATE", stream, group, "$", "MKSTREAM");
    } catch {
      // group already exists
    }

    while (this.polling) {
      const response = (await this.redis.commands.xreadgroup(
        "GROUP",
        group,
        consumer,
        "COUNT",
        10,
        "BLOCK",
        2000,
        "STREAMS",
        stream,
        ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      if (!response) {
        continue;
      }

      for (const [, entries] of response) {
        for (const [id, kv] of entries) {
          const record = this.parseKvPayload(kv);
          if (record.eventType !== "document.update" || record.sourceInstanceId === this.instanceId) {
            await this.redis.commands.xack(stream, group, id);
            continue;
          }

          const doc = this.docs.get(record.documentId);
          if (doc) {
            Y.applyUpdate(doc, Buffer.from(record.payload, "base64"));
          }
          this.broadcastToDocument(record.documentId, {
            type: "document.update",
            payload: record
          });
          await this.redis.commands.xack(stream, group, id);
        }
      }
    }
  }

  private parseKvPayload(kv: string[]): UpdateEnvelope {
    const eventIndex = kv.findIndex((value) => value === "event");
    const eventPayload = eventIndex >= 0 ? kv[eventIndex + 1] : "{}";
    return JSON.parse(eventPayload) as UpdateEnvelope;
  }

  private async ensureDocumentState(documentId: string): Promise<Y.Doc> {
    let doc = this.docs.get(documentId);
    if (doc) {
      return doc;
    }

    const loaded = await this.documentsService.loadDocumentStateWithoutAuth(documentId);
    doc = loaded.doc;
    this.docs.set(documentId, doc);
    return doc;
  }

  private addSocket(documentId: string, client: WebSocket): void {
    const sockets = this.socketsByDocument.get(documentId) ?? new Set<WebSocket>();
    sockets.add(client);
    this.socketsByDocument.set(documentId, sockets);
  }

  private removeSocket(documentId: string, client: WebSocket): void {
    const sockets = this.socketsByDocument.get(documentId);
    sockets?.delete(client);
    if (sockets && sockets.size === 0) {
      this.socketsByDocument.delete(documentId);
      this.docs.delete(documentId);
    }
  }

  private broadcastToDocument(documentId: string, message: unknown, exclude?: WebSocket): void {
    const sockets = this.socketsByDocument.get(documentId);
    if (!sockets) {
      return;
    }
    const serialized = JSON.stringify(message);
    for (const socket of sockets) {
      if (socket === exclude || socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      socket.send(serialized);
    }
  }

  private async sendSnapshot(client: WebSocket, documentId: string): Promise<void> {
    const loaded = await this.documentsService.loadDocumentStateWithoutAuth(documentId);
    const snapshot = Y.encodeStateAsUpdate(loaded.doc);
    client.send(
      JSON.stringify({
        type: "document.snapshot",
        payload: {
          documentId,
          version: loaded.document.currentVersion,
          snapshot: Buffer.from(snapshot).toString("base64")
        }
      })
    );
  }

  private presenceKey(documentId: string, userId: string): string {
    return `syncspace:presence:${documentId}:${userId}`;
  }

  private async broadcastPresence(documentId: string, presence: PresenceEnvelope): Promise<void> {
    await this.redis.publishPresence(this.presenceKey(documentId, presence.userId), JSON.stringify(presence), 30);
    this.broadcastToDocument(documentId, { type: "presence.update", payload: presence });
  }
}
