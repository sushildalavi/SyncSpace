import { Module } from "@nestjs/common";
import { AppEnvModule } from "./shared/app-env.js";
import { DatabaseModule } from "./database/database.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { WorkspacesModule } from "./workspaces/workspaces.module.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { CollaborationModule } from "./collaboration/collaboration.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [
    AppEnvModule,
    DatabaseModule,
    RedisModule,
    AuthModule,
    WorkspacesModule,
    DocumentsModule,
    CollaborationModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
