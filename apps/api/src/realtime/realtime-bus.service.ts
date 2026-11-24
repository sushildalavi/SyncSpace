import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis, { type Redis as RedisClient } from "ioredis";
import { randomUUID } from "node:crypto";
import { APP_ENV } from "../shared/app-env.js";

export const EVENT_STREAM = "syncspace:events";
/** `connectionId` of updates the server itself authored (for example a version restore). Every socket should receive these. */
export const SERVER_CONNECTION = "server";

export type BusEvent =
  | { type: "document.update"; documentId: string; connectionId: string; updateId: string; version: number; payload: string; actorId: string }
  | { type: "presence.state"; documentId: string; connectionId: string; state: unknown }
  | { type: "presence.leave"; documentId: string; connectionId: string }
  | { type: "access.changed"; workspaceId: string; userId: string; role: "owner" | "editor" | "viewer" | null }
  | { type: "session.revoked"; userId: string; sessionId: string }
  | { type: "document.deleted"; documentId: string };

export type BusEnvelope = { instanceId: string; event: BusEvent };

const RedisCtor = Redis as unknown as new (url: string, options?: { maxRetriesPerRequest?: number | null }) => RedisClient;

/**
 * Cross-instance fan-out on a Redis Stream.
 *
 * Every instance reads the whole stream with XREAD (no consumer group), so each instance
 * sees every event and can forward it to its own sockets. A shared consumer group would
 * instead hand each entry to only one instance. Durability for document content lives in
 * PostgreSQL, so a restarted instance resumes from "$" and clients resync from the database.
 */
@Injectable()
export class RealtimeBus implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeBus.name);
  readonly instanceId = randomUUID();
  private readonly commands: RedisClient;
  private readonly reader: RedisClient;
  private readonly handlers = new Set<(envelope: BusEnvelope) => void>();
  private running = false;
  private loop?: Promise<void>;

  constructor(@Inject(APP_ENV) env: { REDIS_URL: string }) {
    this.commands = new RedisCtor(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.reader = new RedisCtor(env.REDIS_URL, { maxRetriesPerRequest: null });
  }

  /** Returns the shared command connection for non-stream state such as presence. */
  get redis(): RedisClient {
    return this.commands;
  }

  subscribe(handler: (envelope: BusEnvelope) => void): () => void {
    this.handlers.add(handler);
    this.start();
    return () => this.handlers.delete(handler);
  }

  async publish(event: BusEvent): Promise<void> {
    const envelope: BusEnvelope = { instanceId: this.instanceId, event };
    await this.commands.xadd(EVENT_STREAM, "MAXLEN", "~", "20000", "*", "e", JSON.stringify(envelope));
  }

  private start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.loop = this.read();
  }

  private async read(): Promise<void> {
    let lastId = "$";
    while (this.running) {
      try {
        const response = (await this.reader.xread("COUNT", 200, "BLOCK", 2000, "STREAMS", EVENT_STREAM, lastId)) as
          | Array<[string, Array<[string, string[]]>]>
          | null;
        if (!response) {
          continue;
        }
        for (const [, entries] of response) {
          for (const [id, fields] of entries) {
            lastId = id;
            const raw = fields[fields.indexOf("e") + 1];
            if (!raw) {
              continue;
            }
            let envelope: BusEnvelope;
            try {
              envelope = JSON.parse(raw) as BusEnvelope;
            } catch {
              continue;
            }
            for (const handler of this.handlers) {
              try {
                handler(envelope);
              } catch (error) {
                this.logger.error(`bus handler failed: ${String(error)}`);
              }
            }
          }
        }
      } catch (error) {
        if (!this.running) {
          return;
        }
        this.logger.warn(`stream read failed, retrying: ${String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    this.reader.disconnect();
    await this.loop?.catch(() => undefined);
    await this.commands.quit().catch(() => undefined);
  }
}
