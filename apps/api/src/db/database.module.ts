import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { APP_ENV } from "../shared/app-env.js";
import * as schema from "./schema.js";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export const DB = Symbol("DB");
const PG_POOL = Symbol("PG_POOL");

/**
 * A PostgreSQL restart or crash makes `pg` emit "error" on its connections, whether they are idle in the pool or
 * checked out between two statements of a transaction. An unhandled "error" event ends the Node process, so both are
 * listened for. The broken connection is discarded and later queries open new ones.
 */
export function createPool(connectionString: string): Pool {
  const logger = new Logger("Database");
  const pool = new Pool({ connectionString, max: 20, connectionTimeoutMillis: 10_000 });
  pool.on("error", (error) => logger.warn(`idle connection lost: ${error.message}`));
  pool.on("connect", (client) => {
    client.on("error", (error) => logger.warn(`connection lost: ${error.message}`));
  });
  return pool;
}

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
      useFactory: (env: { DATABASE_URL: string }) => createPool(env.DATABASE_URL)
    },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: Pool): Db => drizzle(pool, { schema }) },
    PoolLifecycle
  ],
  exports: [DB]
})
export class DatabaseModule {}
