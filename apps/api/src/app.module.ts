import { Module } from "@nestjs/common";
import { AccessModule } from "./access/access.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CollaborationModule } from "./collaboration/collaboration.module.js";
import { DatabaseModule } from "./db/database.module.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { ConfigController, RootController } from "./config.controller.js";
import { HealthController } from "./health.controller.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { MailModule } from "./mail/mail.module.js";
import { MeModule } from "./me/me.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { AppEnvModule } from "./shared/app-env.js";
import { WorkspacesModule } from "./workspaces/workspaces.module.js";

@Module({
  imports: [
    AppEnvModule,
    DatabaseModule,
    MailModule,
    RealtimeModule,
    AuditModule,
    AccessModule,
    AuthModule,
    WorkspacesModule,
    DocumentsModule,
    IntegrationsModule,
    MeModule,
    CollaborationModule
  ],
  controllers: [HealthController, ConfigController, RootController]
})
export class AppModule {}
