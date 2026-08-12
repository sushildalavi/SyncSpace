import { IsEmail, IsIn, IsString, MinLength } from "class-validator";
import type { WorkspaceRole } from "@syncspace/contracts";

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(["owner", "editor", "viewer"])
  role!: WorkspaceRole;
}

export class UpdateMemberRoleDto {
  @IsIn(["owner", "editor", "viewer"])
  role!: WorkspaceRole;
}
