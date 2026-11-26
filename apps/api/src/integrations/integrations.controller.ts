import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseEnumPipe, Post, Put } from "@nestjs/common";
import { IntegrationMessageSchema, IntegrationUpsertSchema } from "@syncspace/contracts";
import type { AuthenticatedUser } from "../auth/session.guard.js";
import { CurrentUser } from "../common/currentUser.decorator.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { IntegrationsService } from "./integrations.service.js";

enum Provider {
  slack = "slack",
  teams = "teams"
}

@Controller("workspaces/:workspaceId/integrations")
export class IntegrationsController {
  constructor(@Inject(IntegrationsService) private readonly integrations: IntegrationsService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.integrations.list(workspaceId, user.id);
  }

  @Put(":provider")
  upsert(
    @Param("workspaceId") workspaceId: string,
    @Param("provider", new ParseEnumPipe(Provider)) provider: Provider,
    @Body(new ZodPipe(IntegrationUpsertSchema)) body: { name: string; webhookUrl: string; enabled: boolean },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.integrations.upsert(workspaceId, provider, body, user);
  }

  @Delete(":provider")
  @HttpCode(204)
  async remove(
    @Param("workspaceId") workspaceId: string,
    @Param("provider", new ParseEnumPipe(Provider)) provider: Provider,
    @CurrentUser() user: AuthenticatedUser
  ) {
    await this.integrations.remove(workspaceId, provider, user.id);
  }

  @Post(":provider/send")
  @HttpCode(200)
  send(
    @Param("workspaceId") workspaceId: string,
    @Param("provider", new ParseEnumPipe(Provider)) provider: Provider,
    @Body(new ZodPipe(IntegrationMessageSchema)) body: { title: string; summary: string; documentUrl: string },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.integrations.send(workspaceId, provider, body, user.id);
  }
}
