import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { WorkspaceRoles } from "../common/roles.decorator.js";
import { WorkspaceRoleGuard } from "../common/workspace-role.guard.js";
import { CreateWorkspaceDto, InviteMemberDto, UpdateMemberRoleDto } from "./dto.js";
import { WorkspacesService } from "./workspaces.service.js";

@Controller("workspaces")
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.workspacesService.listForUser(user.id);
  }

  @Post()
  create(@Body() body: CreateWorkspaceDto, @CurrentUser() user: { id: string; email: string; displayName: string }) {
    return this.workspacesService.create(body, user);
  }

  @Get(":workspaceId")
  async get(@Param("workspaceId") workspaceId: string, @CurrentUser() user: { id: string }) {
    await this.workspacesService.requireMembership(workspaceId, user.id);
    return this.workspacesService.findById(workspaceId);
  }

  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles("owner")
  @Post(":workspaceId/members")
  invite(
    @Param("workspaceId") workspaceId: string,
    @Body() body: InviteMemberDto,
    @CurrentUser() user: { id: string }
  ) {
    return this.workspacesService.inviteMember(workspaceId, body.email, body.role, user.id);
  }

  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles("owner")
  @Put(":workspaceId/members/:userId")
  updateRole(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body() body: UpdateMemberRoleDto
  ) {
    return this.workspacesService.updateMemberRole(workspaceId, userId, body.role);
  }

  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles("owner")
  @Delete(":workspaceId/members/:userId")
  removeMember(@Param("workspaceId") workspaceId: string, @Param("userId") userId: string) {
    return this.workspacesService.removeMember(workspaceId, userId);
  }
}
