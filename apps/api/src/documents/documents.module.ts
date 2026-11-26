import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";
import { SharesController } from "./shares.controller.js";
import { SharesService } from "./shares.service.js";

@Module({
  controllers: [DocumentsController, SharesController],
  providers: [DocumentsService, SharesService],
  exports: [DocumentsService]
})
export class DocumentsModule {}
