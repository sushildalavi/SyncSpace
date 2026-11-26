/**
 * One-off MongoDB -> PostgreSQL migration. Read-only against MongoDB.
 *
 *   LEGACY_MONGO_URL=mongodb://localhost:27017/syncspace DATABASE_URL=postgres://... \
 *     pnpm --filter @syncspace/api migrate:mongo -- [--dry-run]
 *
 * Exit code is non-zero if any document's migrated state differs from the source.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { MongoClient } from "mongodb";
import { Pool } from "pg";
import * as schema from "../src/db/schema.js";
import { runMigrations } from "../src/db/migrate.js";
import { migrateFromMongo, type LegacySource } from "../src/migration/mongoMigrator.js";
import type { Db } from "../src/db/database.module.js";

const mongoUrl = process.env.LEGACY_MONGO_URL;
const pgUrl = process.env.DATABASE_URL;
if (!mongoUrl || !pgUrl) {
  console.error("LEGACY_MONGO_URL and DATABASE_URL are required");
  process.exit(2);
}
const dryRun = process.argv.includes("--dry-run");

const mongo = await new MongoClient(mongoUrl).connect();
const database = mongo.db();
const pool = new Pool({ connectionString: pgUrl });
const db = drizzle(pool, { schema });
await runMigrations(db as never);

const all = <T>(name: string, filter: Record<string, unknown> = {}) => database.collection(name).find(filter).toArray() as unknown as Promise<T[]>;
const source: LegacySource = {
  users: () => all("users"),
  workspaces: () => all("workspaces"),
  memberships: () => all("workspacememberships"),
  integrations: () => all("workspaceintegrations"),
  documents: () => all("documents"),
  snapshots: (documentId) => all("documentsnapshots", { documentId }),
  updates: (documentId) => all("documentupdates", { documentId })
};

const report = await migrateFromMongo(db as unknown as Db, source, { dryRun });
console.log(JSON.stringify(report, null, 2));
await mongo.close();
await pool.end();
const ok = report.verification.mismatches.length === 0;
console.error(ok ? (dryRun ? "Dry run OK (nothing written)" : "Migration verified") : `VERIFICATION FAILED for ${report.verification.mismatches.length} document(s)`);
process.exit(ok ? 0 : 1);
