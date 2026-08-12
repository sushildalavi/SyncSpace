import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis, { type Redis as RedisClient } from "ioredis";
import { APP_ENV } from "../shared/app-env.js";

const RedisCtor = Redis as unknown as new (
  url: string,
  options?: { maxRetriesPerRequest?: number | null }
) => RedisClient;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: RedisClient;
  private subscriber?: RedisClient;

  constructor(@Inject(APP_ENV) private readonly env: { REDIS_URL: string }) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.client?.quit(), this.subscriber?.quit()].filter(Boolean) as Promise<unknown>[]);
  }

  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    this.client = new RedisCtor(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.subscriber = new RedisCtor(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.logger.log("Redis connected");
  }

  get commands(): RedisClient {
    if (!this.client) {
      throw new Error("Redis client not ready");
    }
    return this.client;
  }

  async xadd(stream: string, ...args: string[]): Promise<string> {
    return (await this.commands.xadd(stream, ...args)) as string;
  }

  async publishPresence(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.commands.set(key, value, "EX", ttlSeconds);
  }

  async removePresence(key: string): Promise<void> {
    await this.commands.del(key);
  }
}
