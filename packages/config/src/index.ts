import { z } from "zod";

const booleanFlag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

export const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    /** Used by Better Auth to sign cookies and encrypt secrets. */
    BETTER_AUTH_SECRET: z.string().min(32),
    /** Public origin of the API. OAuth callbacks are served from here. */
    API_BASE_URL: z.string().url().default("http://localhost:3001"),
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    API_PORT: z.coerce.number().int().positive().default(3001),
    WEB_PORT: z.coerce.number().int().positive().default(3000),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    SMTP_URL: z.string().url().optional(),
    MAIL_FROM: z.string().min(3).default("SyncSpace <no-reply@syncspace.local>"),
    REQUIRE_EMAIL_VERIFICATION: booleanFlag.default("false"),
    RUN_MIGRATIONS: booleanFlag.default("true"),
    /** Number of reverse proxies in front of the API (0 = clients connect directly). Controls which IP is trusted. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
    /** Only read by the one-off MongoDB -> PostgreSQL migrator. */
    LEGACY_MONGO_URL: z.string().url().optional()
  })
  .refine((env) => Boolean(env.GOOGLE_CLIENT_ID) === Boolean(env.GOOGLE_CLIENT_SECRET), {
    message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
    path: ["GOOGLE_CLIENT_SECRET"]
  });

export type Environment = z.infer<typeof EnvironmentSchema>;

export function parseEnvironment(env: NodeJS.ProcessEnv): Environment {
  return EnvironmentSchema.parse(env);
}
