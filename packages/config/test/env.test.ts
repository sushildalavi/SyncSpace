import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/index";

const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db", REDIS_URL: "redis://localhost:6379", BETTER_AUTH_SECRET: "x".repeat(32) };

describe("parseEnvironment", () => {
  it("treats blank optional values as not configured", () => {
    const env = parseEnvironment({ ...base, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", SMTP_URL: "" });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.SMTP_URL).toBeUndefined();
  });
  it("requires Google credentials as a pair", () => {
    expect(() => parseEnvironment({ ...base, GOOGLE_CLIENT_ID: "id" })).toThrow(/set together/);
    expect(parseEnvironment({ ...base, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }).GOOGLE_CLIENT_ID).toBe("id");
  });
  it("rejects a weak auth secret", () => {
    expect(() => parseEnvironment({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow();
  });
  it("defaults to no trusted proxy and parses booleans", () => {
    const env = parseEnvironment({ ...base, REQUIRE_EMAIL_VERIFICATION: "true" });
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.REQUIRE_EMAIL_VERIFICATION).toBe(true);
  });
});
