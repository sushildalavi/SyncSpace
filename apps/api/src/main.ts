import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { drizzle } from "drizzle-orm/node-postgres";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { AUTH } from "./auth/auth.constants.js";
import type { Auth } from "./auth/auth.factory.js";
import { originCheck } from "./common/origin.middleware.js";
import { DB, type Db } from "./db/database.module.js";
import { runMigrations } from "./db/migrate.js";
import { APP_ENV, type AppEnv } from "./shared/app-env.js";

async function bootstrap(): Promise<void> {
  // Better Auth reads the raw request body itself, so Nest's body parser is disabled
  // and re-added after the auth handler.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const env = app.get<AppEnv>(APP_ENV);

  if (env.RUN_MIGRATIONS) {
    await runMigrations(app.get<Db>(DB) as unknown as ReturnType<typeof drizzle>);
  }

  app.set("trust proxy", 1);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(helmet());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
  app.use(originCheck(env.WEB_ORIGIN));
  app.getHttpAdapter().getInstance().all("/api/auth/*splat", toNodeHandler(app.get<Auth>(AUTH)));
  app.use(express.json({ limit: "100kb" }));
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
}

void bootstrap();
