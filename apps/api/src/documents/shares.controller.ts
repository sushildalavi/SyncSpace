import { Body, Controller, Delete, Get, HttpCode, Inject, Ip, Param, Put } from "@nestjs/common";
import { DocumentShareSchema, type DocumentShareInput } from "@syncspace/contracts";
import type { AuthenticatedUser } from "../auth/session.guard.js";
import { CurrentUser } from "../common/currentUser.decorator.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { SharesService } from "./shares.service.js";

@Controller("documents/:documentId/shares")
export class SharesController {
  constructor(@Inject(SharesService) private readonly shares: SharesService) {}

  @Get()
  list(@Param("documentId") documentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shares.list(documentId, user.id);
  }

  @Put()
  share(
    @Param("documentId") documentId: string,
    @Body(new ZodPipe(DocumentShareSchema)) body: DocumentShareInput,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string
  ) {
    return this.shares.share(documentId, user, body.email, body.role, ip);
  }

  @Delete(":shareId")
  @HttpCode(204)
  async remove(@Param("documentId") documentId: string, @Param("shareId") shareId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.shares.remove(documentId, shareId, user.id);
  }
}
