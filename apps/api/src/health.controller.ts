import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { Public } from "./auth/public.decorator.js";
import { DB, type Db } from "./db/database.module.js";
import { RealtimeBus } from "./realtime/realtime-bus.service.js";

@Controller("health")
@Public()
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus
  ) {}

  @Get()
  async health() {
    const [postgres, redis] = await Promise.allSettled([this.db.execute(sql`select 1`), this.bus.redis.ping()]);
    return {
      ok: postgres.status === "fulfilled" && redis.status === "fulfilled",
      service: "syncspace-api",
      postgres: postgres.status === "fulfilled",
      redis: redis.status === "fulfilled"
    };
  }
}
