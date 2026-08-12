import { z } from "zod";

export const WorkspaceRoleSchema = z.enum(["owner", "editor", "viewer"]);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const AuthRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(80)
});

export type AuthRegisterInput = z.infer<typeof AuthRegisterSchema>;

export const AuthLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export type AuthLoginInput = z.infer<typeof AuthLoginSchema>;

export const WorkspaceCreateSchema = z.object({
  name: z.string().min(1).max(120)
});

export type WorkspaceCreateInput = z.infer<typeof WorkspaceCreateSchema>;

export const DocumentCreateSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(160)
});

export type DocumentCreateInput = z.infer<typeof DocumentCreateSchema>;

export const CollaborationUpdateSchema = z.object({
  eventId: z.string().min(1),
  documentId: z.string().min(1),
  workspaceId: z.string().min(1),
  actorId: z.string().min(1),
  clientId: z.string().min(1),
  updateId: z.string().min(1),
  version: z.number().int().nonnegative(),
  baseVersion: z.number().int().nonnegative(),
  payload: z.string().min(1)
});

export type CollaborationUpdateInput = z.infer<typeof CollaborationUpdateSchema>;

export const PresenceUpdateSchema = z.object({
  eventId: z.string().min(1),
  documentId: z.string().min(1),
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
  color: z.string().min(1),
  cursor: z
    .object({
      anchor: z.number().int().nonnegative(),
      head: z.number().int().nonnegative()
    })
    .optional(),
  status: z.enum(["active", "idle", "offline"]),
  expiresAt: z.string().datetime()
});

export type PresenceUpdateInput = z.infer<typeof PresenceUpdateSchema>;
