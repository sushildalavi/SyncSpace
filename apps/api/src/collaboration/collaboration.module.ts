import { Module } from "@nestjs/common";
import { AppEnvModule } from "../shared/app-env.js";
import { DatabaseModule } from "../database/database.module.js";
import { RedisModule } from "../redis/redis.module.js";
import { DocumentsModule } from "../documents/documents.module.js";
import { CollaborationGateway } from "./collaboration.gateway.js";
import { CollaborationService } from "./collaboration.service.js";

@Module({
  imports: [AppEnvModule, DatabaseModule, RedisModule, DocumentsModule],
  providers: [CollaborationGateway, CollaborationService],
  exports: [CollaborationService]
})
export class CollaborationModule {}
