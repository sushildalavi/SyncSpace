import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module.js";
import { CollaborationGateway } from "./collaboration.gateway.js";
import { CollaborationService } from "./collaboration.service.js";

@Module({ imports: [DocumentsModule], providers: [CollaborationService, CollaborationGateway] })
export class CollaborationModule {}
