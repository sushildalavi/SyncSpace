import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Roles and permissions: the single source of truth for RBAC.         */
/* The API enforces these. The web app only reads them to shape the UI. */
/* ------------------------------------------------------------------ */

export const WorkspaceRoleSchema = z.enum(["owner", "editor", "viewer"]);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const PERMISSIONS = [
  "workspace.read",
  "workspace.update",
  "workspace.delete",
  "member.manage",
  "integration.manage",
  "integration.send",
  "document.read",
  "document.create",
  "document.write",
  "document.delete",
  "document.share"
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  editor: [
    "workspace.read",
    "integration.send",
    "document.read",
    "document.create",
    "document.write",
    "document.delete"
  ],
  viewer: ["workspace.read", "document.read"]
};

export function roleCan(role: WorkspaceRole | null | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

/* ---------------- single-document sharing ---------------- */

export const ShareRoleSchema = z.enum(["editor", "viewer"]);
export type ShareRole = z.infer<typeof ShareRoleSchema>;

/** What a share grants. Deliberately narrower than the workspace role of the same name: no delete, create or share. */
export const SHARE_PERMISSIONS: Record<ShareRole, readonly Permission[]> = {
  editor: ["document.read", "document.write"],
  viewer: ["document.read"]
};

const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 1, editor: 2, owner: 3 };

/** Combines workspace membership with a direct share. The stronger of the two wins; permissions are the union. */
export function documentAccess(workspaceRole: WorkspaceRole | null, shareRole: ShareRole | null): { role: WorkspaceRole; permissions: Permission[] } | null {
  const candidates = [workspaceRole, shareRole].filter((value): value is WorkspaceRole => value !== null);
  if (candidates.length === 0) {
    return null;
  }
  const role = candidates.reduce((best, next) => (ROLE_RANK[next] > ROLE_RANK[best] ? next : best));
  const granted = new Set<Permission>([
    ...(workspaceRole ? ROLE_PERMISSIONS[workspaceRole] : []),
    ...(shareRole ? SHARE_PERMISSIONS[shareRole] : [])
  ]);
  return { role, permissions: PERMISSIONS.filter((permission) => granted.has(permission)) };
}

/* ------------------------------------------------------------------ */
/* Request bodies                                                      */
/* ------------------------------------------------------------------ */

export const WorkspaceCreateSchema = z.object({ name: z.string().trim().min(1).max(120) });
export type WorkspaceCreateInput = z.infer<typeof WorkspaceCreateSchema>;

export const WorkspaceUpdateSchema = z.object({ name: z.string().trim().min(1).max(120) });

export const MemberInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: WorkspaceRoleSchema
});
export type MemberInviteInput = z.infer<typeof MemberInviteSchema>;

export const MemberRoleUpdateSchema = z.object({ role: WorkspaceRoleSchema });

export const DocumentCreateSchema = z.object({ title: z.string().trim().min(1).max(160) });
export type DocumentCreateInput = z.infer<typeof DocumentCreateSchema>;

export const DocumentShareSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: ShareRoleSchema
});
export type DocumentShareInput = z.infer<typeof DocumentShareSchema>;

export const AccountDeleteSchema = z.object({
  /** The account's own address, typed again to confirm intent. */
  confirmEmail: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128).optional()
});
export type AccountDeleteInput = z.infer<typeof AccountDeleteSchema>;

export const DocumentRestoreSchema = z.object({ version: z.number().int().min(1) });

export const DocumentUpdateMetaSchema = z.object({ title: z.string().trim().min(1).max(160) });

export const IntegrationProviderSchema = z.enum(["slack", "teams"]);
export const IntegrationUpsertSchema = z.object({
  name: z.string().trim().min(1).max(120),
  webhookUrl: z.string().url().max(2048),
  enabled: z.boolean()
});
export const IntegrationMessageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(2000),
  documentUrl: z.string().url().max(2048)
});

export const ProfileUpdateSchema = z.object({ name: z.string().trim().min(1).max(80) });

/* ------------------------------------------------------------------ */
/* Collaboration protocol                                              */
/* ------------------------------------------------------------------ */

/** Sent by clients. The server assigns versions, so none is accepted here. */
export const CollaborationUpdateSchema = z.object({
  documentId: z.string().min(1),
  updateId: z.string().min(1).max(64),
  /** base64 encoded Yjs incremental update */
  /* at most COLLAB_LIMITS.maxUpdateChars, which is declared below */
  payload: z.string().min(1).max(1_400_000)
});
export type CollaborationUpdateInput = z.infer<typeof CollaborationUpdateSchema>;

/** Sent by clients. The server fills in identity, so none is accepted here. */
export const PresenceUpdateSchema = z.object({
  /** Opaque Yjs relative positions ({anchor, head}) produced by the editor; the server only relays them. */
  cursor: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["active", "idle"])
});
export type PresenceUpdateInput = z.infer<typeof PresenceUpdateSchema>;

export type PresenceState = {
  userId: string;
  userName: string;
  color: string;
  status: "active" | "idle" | "offline";
  cursor?: Record<string, unknown>;
};

/** Application close codes sent on the collaboration socket. */
export const CLOSE_CODES = {
  /** The server couldn't do its job just now (for example the database is down). Clients reconnect and resend. */
  tryAgain: 1013,
  unauthenticated: 4401,
  forbidden: 4403,
  notFound: 4404,
  accessRevoked: 4410,
  sessionRevoked: 4411,
  rateLimited: 4429
} as const;

export const COLLAB_LIMITS = { maxMessageBytes: 2_000_000, maxMessagesPerSecond: 40, maxUpdateChars: 1_400_000 } as const;

/** Deterministic, accessible presence colors. */
export const PRESENCE_COLORS = [
  "#2563eb",
  "#c2410c",
  "#7c3aed",
  "#0f766e",
  "#be185d",
  "#4d7c0f",
  "#b45309",
  "#4338ca"
] as const;

export function presenceColorFor(userId: string): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]!;
}
