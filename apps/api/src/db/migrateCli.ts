import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { runMigrations } from "./migrate.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
await runMigrations(drizzle(pool));
await pool.end();
console.log("Migrations applied");
