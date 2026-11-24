import { Body, Controller, Delete, Get, HttpCode, Inject, Ip, Param, Patch, Post, Put } from "@nestjs/common";
import {
  MemberInviteSchema,
  MemberRoleUpdateSchema,
  WorkspaceCreateSchema,
  WorkspaceUpdateSchema,
  type MemberInviteInput,
  type WorkspaceCreateInput
} from "@syncspace/contracts";
import { z } from "zod";
import type { AuthenticatedUser } from "../auth/session.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { WorkspacesService } from "./workspaces.service.js";

const TokenSchema = z.object({ token: z.string().min(16).max(200) });

@Controller()
export class WorkspacesController {
  constructor(@Inject(WorkspacesService) private readonly workspaces: WorkspacesService) {}

  @Get("workspaces")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.listForUser(user.id);
  }

  @Post("workspaces")
  create(@Body(new ZodPipe(WorkspaceCreateSchema)) body: WorkspaceCreateInput, @CurrentUser() user: AuthenticatedUser, @Ip() ip: string) {
    return this.workspaces.create(body.name, user, ip);
  }

  @Get("workspaces/:workspaceId")
  get(@Param("workspaceId") workspaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.get(workspaceId, user.id);
  }

  @Patch("workspaces/:workspaceId")
  rename(
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodPipe(WorkspaceUpdateSchema)) body: { name: string },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.workspaces.rename(workspaceId, user, body.name);
  }

  @Delete("workspaces/:workspaceId")
  @HttpCode(204)
  async archive(@Param("workspaceId") workspaceId: string, @CurrentUser() user: AuthenticatedUser, @Ip() ip: string) {
    await this.workspaces.archive(workspaceId, user, ip);
  }

  @Get("workspaces/:workspaceId/members")
  members(@Param("workspaceId") workspaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.listMembers(workspaceId, user.id);
  }

  @Put("workspaces/:workspaceId/members/:userId")
  updateRole(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body(new ZodPipe(MemberRoleUpdateSchema)) body: { role: "owner" | "editor" | "viewer" },
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string
  ) {
    return this.workspaces.updateMemberRole(workspaceId, user, userId, body.role, ip);
  }

  @Delete("workspaces/:workspaceId/members/:userId")
  @HttpCode(204)
  async removeMember(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string
  ) {
    await this.workspaces.removeMember(workspaceId, user, userId, ip);
  }

  @Get("workspaces/:workspaceId/invitations")
  invitations(@Param("workspaceId") workspaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.listInvitations(workspaceId, user.id);
  }

  @Post("workspaces/:workspaceId/invitations")
  invite(
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodPipe(MemberInviteSchema)) body: MemberInviteInput,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string
  ) {
    return this.workspaces.invite(workspaceId, user, body.email, body.role, ip);
  }

  @Delete("workspaces/:workspaceId/invitations/:invitationId")
  @HttpCode(204)
  async revoke(@Param("workspaceId") workspaceId: string, @Param("invitationId") invitationId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.workspaces.revokeInvitation(workspaceId, invitationId, user);
  }

  @Get("invitations")
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.listMine(user);
  }

  @Post("invitations/preview")
  @HttpCode(200)
  preview(@Body(new ZodPipe(TokenSchema)) body: { token: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.previewToken(body.token, user);
  }

  @Post("invitations/accept")
  @HttpCode(200)
  acceptByToken(@Body(new ZodPipe(TokenSchema)) body: { token: string }, @CurrentUser() user: AuthenticatedUser, @Ip() ip: string) {
    return this.workspaces.acceptByToken(body.token, user, ip);
  }

  @Post("invitations/:invitationId/accept")
  @HttpCode(200)
  acceptById(@Param("invitationId") invitationId: string, @CurrentUser() user: AuthenticatedUser, @Ip() ip: string) {
    return this.workspaces.acceptById(invitationId, user, ip);
  }
}
