import { z } from "zod";

export const EnvironmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().min(1),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:3001"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000)
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export function parseEnvironment(env: NodeJS.ProcessEnv): Environment {
  return EnvironmentSchema.parse(env);
}
