import { ForbiddenException, Injectable, NotFoundException, Inject } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { WorkspaceRole } from "@syncspace/contracts";

type UserContext = { id: string; email: string; displayName: string };

@Injectable()
export class WorkspacesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listForUser(userId: string) {
    const memberships = await this.database.models.memberships.find({ userId }).lean();
    const workspaceIds = memberships.map((membership) => membership.workspaceId);
    const workspaces = await this.database.models.workspaces.find({ _id: { $in: workspaceIds }, archivedAt: null }).lean();
    return workspaces.map((workspace) => ({
      ...workspace,
      membership: memberships.find((membership) => membership.workspaceId === workspace._id)
    }));
  }

  async create(input: { name: string }, user: UserContext) {
    const workspace = await this.database.models.workspaces.create({
      name: input.name,
      ownerId: user.id
    });

    await this.database.models.memberships.create({
      workspaceId: workspace._id,
      userId: user.id,
      role: "owner"
    });

    return workspace;
  }

  async findById(workspaceId: string) {
    const workspace = await this.database.models.workspaces.findById(workspaceId).lean();
    if (!workspace || workspace.archivedAt) {
      throw new NotFoundException("Workspace not found");
    }
    return workspace;
  }

  async findMembership(workspaceId: string, userId: string) {
    return this.database.models.memberships.findOne({ workspaceId, userId }).lean();
  }

  async requireMembership(workspaceId: string, userId: string, roles?: WorkspaceRole[]) {
    const membership = await this.findMembership(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException("Workspace access denied");
    }
    if (roles && roles.length > 0 && !roles.includes(membership.role)) {
      throw new ForbiddenException("Workspace role denied");
    }
    return membership;
  }

  async inviteMember(workspaceId: string, email: string, role: WorkspaceRole, invitedBy: string) {
    const user = await this.database.models.users.findOne({ email: email.toLowerCase() }).lean();
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const workspace = await this.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    const membership = await this.database.models.memberships.findOneAndUpdate(
      { workspaceId, userId: user._id },
      { workspaceId, userId: user._id, role, invitedBy },
      { upsert: true, new: true }
    );

    return membership;
  }

  async updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
    const membership = await this.database.models.memberships.findOneAndUpdate(
      { workspaceId, userId },
      { role },
      { new: true }
    );
    if (!membership) {
      throw new NotFoundException("Membership not found");
    }
    return membership;
  }

  async removeMember(workspaceId: string, userId: string) {
    const result = await this.database.models.memberships.deleteOne({ workspaceId, userId });
    if (result.deletedCount === 0) {
      throw new NotFoundException("Membership not found");
    }
  }
}
