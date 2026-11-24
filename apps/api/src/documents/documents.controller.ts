import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseIntPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { DocumentCreateSchema, DocumentRestoreSchema, DocumentUpdateMetaSchema } from "@syncspace/contracts";
import type { AuthenticatedUser } from "../auth/session.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DocumentsService } from "./documents.service.js";

@Controller()
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  @Get("workspaces/:workspaceId/documents")
  list(@Param("workspaceId") workspaceId: string, @Query("q") q: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.list(workspaceId, user.id, q);
  }

  @Post("workspaces/:workspaceId/documents")
  create(
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodPipe(DocumentCreateSchema)) body: { title: string },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.documents.create(workspaceId, body.title, user.id);
  }

  @Get("documents/recent")
  recent(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.recent(user.id);
  }

  @Get("documents/favorites")
  favorites(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.favorites(user.id);
  }

  @Get("search")
  search(@Query("q") q: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.search(user.id, q ?? "");
  }

  @Get("documents/:documentId")
  get(@Param("documentId") documentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.get(documentId, user.id);
  }

  @Patch("documents/:documentId")
  rename(
    @Param("documentId") documentId: string,
    @Body(new ZodPipe(DocumentUpdateMetaSchema)) body: { title: string },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.documents.rename(documentId, body.title, user.id);
  }

  @Delete("documents/:documentId")
  @HttpCode(204)
  async remove(@Param("documentId") documentId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.documents.remove(documentId, user.id);
  }

  @Put("documents/:documentId/favorite")
  favorite(@Param("documentId") documentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.setFavorite(documentId, user.id, true);
  }

  @Delete("documents/:documentId/favorite")
  unfavorite(@Param("documentId") documentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.setFavorite(documentId, user.id, false);
  }

  @Get("documents/:documentId/history")
  history(@Param("documentId") documentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.history(documentId, user.id);
  }

  @Post("documents/:documentId/restore")
  @HttpCode(200)
  restore(
    @Param("documentId") documentId: string,
    @Body(new ZodPipe(DocumentRestoreSchema)) body: { version: number },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.documents.restore(documentId, body.version, user.id);
  }

  @Get("documents/:documentId/history/:version")
  stateAt(
    @Param("documentId") documentId: string,
    @Param("version", ParseIntPipe) version: number,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.documents.stateAt(documentId, user.id, version);
  }
}
