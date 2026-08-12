import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { WorkspaceRoles } from "../common/roles.decorator.js";
import { WorkspaceRoleGuard } from "../common/workspace-role.guard.js";
import { SendIntegrationMessageDto, UpsertIntegrationDto } from "./dto.js";
import { IntegrationsService } from "./integrations.service.js";

@Controller("workspaces/:workspaceId/integrations")
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  list(@Param("workspaceId") workspaceId: string, @CurrentUser() user: { id: string }) {
    return this.integrationsService.listForWorkspace(workspaceId, user.id);
  }

  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles("owner")
  @Put(":provider")
  upsert(
    @Param("workspaceId") workspaceId: string,
    @Param("provider") provider: "slack" | "teams",
    @Body() body: Omit<UpsertIntegrationDto, "provider">,
    @CurrentUser() user: { id: string; email: string; displayName: string }
  ) {
    return this.integrationsService.upsert(workspaceId, provider, body, user);
  }

  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles("owner")
  @Delete(":provider")
  remove(@Param("workspaceId") workspaceId: string, @Param("provider") provider: "slack" | "teams", @CurrentUser() user: { id: string }) {
    return this.integrationsService.remove(workspaceId, provider, user.id);
  }

  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles("owner", "editor")
  @Post(":provider/send")
  send(
    @Param("workspaceId") workspaceId: string,
    @Param("provider") provider: "slack" | "teams",
    @Body() body: SendIntegrationMessageDto,
    @CurrentUser() user: { id: string }
  ) {
    return this.integrationsService.sendMessage(workspaceId, provider, body, user.id);
  }
}
