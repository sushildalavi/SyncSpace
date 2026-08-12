import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { CreateDocumentDto } from "./dto.js";
import { DocumentsService } from "./documents.service.js";

@Controller()
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documentsService: DocumentsService) {}

  @Get("workspaces/:workspaceId/documents")
  list(@Param("workspaceId") workspaceId: string, @CurrentUser() user: { id: string }) {
    return this.documentsService.list(workspaceId, user.id);
  }

  @Post("workspaces/:workspaceId/documents")
  create(
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateDocumentDto,
    @CurrentUser() user: { id: string }
  ) {
    return this.documentsService.create(workspaceId, body.title, user.id);
  }

  @Get("documents/:documentId")
  get(@Param("documentId") documentId: string, @CurrentUser() user: { id: string }) {
    return this.documentsService.getDocument(documentId, user.id);
  }

  @Get("documents/:documentId/versions")
  versions(@Param("documentId") documentId: string, @CurrentUser() user: { id: string }) {
    return this.documentsService.listVersions(documentId, user.id);
  }
}
