import { Global, Inject, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { APP_ENV } from "../shared/app-env.js";
import * as schema from "./schema.js";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export const DB = Symbol("DB");
const PG_POOL = Symbol("PG_POOL");

@Injectable()
class PoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_ENV],
      useFactory: (env: { DATABASE_URL: string }) => new Pool({ connectionString: env.DATABASE_URL, max: 20 })
    },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: Pool): Db => drizzle(pool, { schema }) },
    PoolLifecycle
  ],
  exports: [DB]
})
export class DatabaseModule {}
