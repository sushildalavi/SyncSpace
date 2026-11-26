import { Body, Controller, Delete, Get, HttpCode, Inject, Query, Req } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import type { IncomingHttpHeaders } from "node:http";
import { AccountDeleteSchema, type AccountDeleteInput } from "@syncspace/contracts";
import type { AuthContext, AuthenticatedUser } from "../auth/session.guard.js";
import { CurrentUser } from "../common/currentUser.decorator.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DB, type Db } from "../db/database.module.js";
import { auditEvent } from "../db/schema.js";
import { AccountService } from "./account.service.js";

/** Session, provider, password and profile management is handled by Better Auth under /api/auth. */
@Controller("me")
export class MeController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AccountService) private readonly account: AccountService
  ) {}

  @Get()
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get("deletion")
  deletionPreview(@CurrentUser() user: AuthenticatedUser) {
    return this.account.deletionPreview(user.id);
  }

  @Delete()
  @HttpCode(204)
  async deleteAccount(
    @Body(new ZodPipe(AccountDeleteSchema)) body: AccountDeleteInput,
    @Req() request: { auth: AuthContext; headers: IncomingHttpHeaders }
  ) {
    await this.account.delete(request.auth, body, request.headers);
  }

  @Get("security-events")
  async securityEvents(@CurrentUser() user: AuthenticatedUser, @Query("limit") limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
    return this.db
      .select({ id: auditEvent.id, type: auditEvent.type, createdAt: auditEvent.createdAt, metadata: auditEvent.metadata })
      .from(auditEvent)
      .where(eq(auditEvent.actorId, user.id))
      .orderBy(desc(auditEvent.createdAt))
      .limit(take);
  }
}
