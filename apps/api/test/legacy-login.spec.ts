import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../src/auth/auth.factory.js";
import * as t from "../src/db/schema.js";
import type { Db } from "../src/db/database.module.js";
import { createTestDb } from "./helpers.js";

let db: Db;
let close: () => Promise<void>;
let auth: ReturnType<typeof createAuth>;
const id = "00000000-0000-4000-8000-0000000000aa";

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  auth = createAuth({
    db,
    sendMail: async () => undefined,
    env: { NODE_ENV: "test", BETTER_AUTH_SECRET: "x".repeat(40), API_BASE_URL: "http://localhost:3001", WEB_ORIGIN: "http://localhost:3000", REQUIRE_EMAIL_VERIFICATION: false, SESSION_TTL_DAYS: 7 }
  });
  await db.insert(t.user).values({ id, email: "legacy@example.com", name: "Legacy", emailVerified: true });
  await db.insert(t.account).values({ id: "acc-legacy", accountId: id, providerId: "credential", userId: id, password: bcrypt.hashSync("old-password-123", 4) });
});
afterAll(() => close());

describe("legacy bcrypt accounts", () => {
  it("rejects a wrong password", async () => {
    await expect(auth.api.signInEmail({ body: { email: "legacy@example.com", password: "nope-nope-nope" } })).rejects.toBeTruthy();
    const [row] = await db.select().from(t.account).where(eq(t.account.id, "acc-legacy"));
    expect(row?.password?.startsWith("$2")).toBe(true); // untouched
  });

  it("signs in with the legacy password and upgrades the stored hash to Argon2id", async () => {
    const result = await auth.api.signInEmail({ body: { email: "legacy@example.com", password: "old-password-123" } });
    expect(result.user.email).toBe("legacy@example.com");
    const [row] = await db.select().from(t.account).where(eq(t.account.id, "acc-legacy"));
    expect(row?.password?.startsWith("$argon2id$")).toBe(true);
    // and the upgraded hash keeps working
    const again = await auth.api.signInEmail({ body: { email: "legacy@example.com", password: "old-password-123" } });
    expect(again.user.id).toBe(id);
  });
});
