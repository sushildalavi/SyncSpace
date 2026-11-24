import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations(db: NodePgDatabase<Record<string, unknown>>): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
