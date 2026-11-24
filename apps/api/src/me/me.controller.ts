import { Controller, Get, Inject, Query } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { AuthenticatedUser } from "../auth/session.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { DB, type Db } from "../db/database.module.js";
import { auditEvent } from "../db/schema.js";

/** Session, provider, password and profile management is handled by Better Auth under /api/auth. */
@Controller("me")
export class MeController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get("security-events")
  async securityEvents(@CurrentUser() user: AuthenticatedUser, @Query("limit") limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
    return this.db
      .select({ id: auditEvent.id, type: auditEvent.type, createdAt: auditEvent.createdAt, metadata: auditEvent.metadata })
      .from(auditEvent)
      .where(and(eq(auditEvent.actorId, user.id)))
      .orderBy(desc(auditEvent.createdAt))
      .limit(take);
  }
}
