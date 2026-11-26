import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root = process.cwd();
const API = "http://localhost:3101";
const WEB = "http://localhost:3100";
const env = {
  NODE_ENV: "test",
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://syncspace:syncspace@localhost:5432/syncspace_test",
  REDIS_URL: process.env.E2E_REDIS_URL ?? "redis://localhost:6379/1",
  BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdef0123456789",
  API_BASE_URL: API,
  WEB_ORIGIN: WEB,
  API_PORT: "3101",
  SMTP_URL: "smtp://localhost:1025",
  REQUIRE_EMAIL_VERIFICATION: "true",
  // Tests present a distinct X-Forwarded-For per browser context so each gets its own rate-limit bucket.
  TRUST_PROXY: "1",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  MOCK_GOOGLE_URL: "http://localhost:3199",
  NODE_OPTIONS: `--import=${path.join(root, "e2e/support/googleFetchPatch.mjs")}`
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL: WEB, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "node e2e/support/mockGoogle.mjs", url: "http://localhost:3199/health", reuseExistingServer: !process.env.CI, env: { MOCK_GOOGLE_PORT: "3199", GOOGLE_CLIENT_ID: "test-client-id", GOOGLE_CLIENT_SECRET: "test-client-secret" } },
    { command: "npx tsx src/main.ts", cwd: "apps/api", url: `${API}/health`, reuseExistingServer: !process.env.CI, timeout: 60_000, env },
    {
      command: "npx next build && npx next start -p 3100",
      cwd: "apps/web",
      url: `${WEB}/sign-in`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: { NEXT_PUBLIC_API_BASE_URL: API, NEXT_TELEMETRY_DISABLED: "1" }
    }
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
