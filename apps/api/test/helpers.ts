import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { randomUUID } from "node:crypto";
import { AccessService } from "../src/access/access.service.js";
import { AuditService } from "../src/audit/audit.service.js";
import type { AuthenticatedUser } from "../src/auth/session.guard.js";
import type { Db } from "../src/db/database.module.js";
import { MIGRATIONS_FOLDER } from "../src/db/migrate.js";
import * as schema from "../src/db/schema.js";
import type { BusEvent } from "../src/realtime/realtime-bus.service.js";

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: db as unknown as Db, close: () => client.close() };
}

export async function createUser(db: Db, overrides: Partial<AuthenticatedUser> = {}): Promise<AuthenticatedUser> {
  const id = overrides.id ?? randomUUID();
  const email = overrides.email ?? `${id.slice(0, 8)}@example.com`;
  const [row] = await db
    .insert(schema.user)
    .values({ id, email, name: overrides.name ?? `User ${id.slice(0, 4)}`, emailVerified: overrides.emailVerified ?? true })
    .returning();
  return { id: row!.id, email: row!.email, name: row!.name, emailVerified: row!.emailVerified, image: null };
}

export function createFakeBus() {
  const published: BusEvent[] = [];
  return {
    published,
    publish: async (event: BusEvent) => {
      published.push(event);
    }
  };
}

export function createServices(db: Db) {
  const access = new AccessService(db);
  const audit = new AuditService(db);
  const bus = createFakeBus();
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const mailer = { send: async (message: { to: string; subject: string; text: string }) => void sent.push(message) };
  return { access, audit, bus, mailer, sent };
}
