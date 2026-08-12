import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { WorkspaceRole } from "@syncspace/contracts";
import { WORKSPACE_ROLES_KEY } from "./roles.decorator.js";
import { WorkspacesService } from "../workspaces/workspaces.service.js";

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly workspacesService: WorkspacesService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<WorkspaceRole[]>(WORKSPACE_ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: { id: string }; params: Record<string, string> }>();
    const workspaceId = request.params.workspaceId;
    const userId = request.user?.id;
    if (!workspaceId || !userId) {
      throw new ForbiddenException("Workspace context missing");
    }

    const membership = await this.workspacesService.findMembership(workspaceId, userId);
    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException("Insufficient workspace role");
    }
    return true;
  }
}
