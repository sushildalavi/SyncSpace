import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea"
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ---------------- Better Auth core tables ---------------- */
/* Column names follow Better Auth's expected model so the Drizzle adapter works unmodified. */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [index("session_user_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    index("account_user_idx").on(table.userId),
    uniqueIndex("account_provider_identity_uq").on(table.providerId, table.accountId)
  ]
);

/** Email verification and password-reset tokens. */
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

/** Better Auth's database-backed rate limiter. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull()
});

/* ---------------- Application tables ---------------- */

export const workspaceRole = pgEnum("workspace_role", ["owner", "editor", "viewer"]);

export const workspace = pgTable(
  "workspace",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [index("workspace_owner_idx").on(table.ownerId)]
);

export const workspaceMember = pgTable(
  "workspace_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex("workspace_member_uq").on(table.workspaceId, table.userId),
    index("workspace_member_user_idx").on(table.userId)
  ]
);

/** Pending invitations for people who may not have an account yet. */
export const workspaceInvitation = pgTable(
  "workspace_invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: workspaceRole("role").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    index("workspace_invitation_email_idx").on(table.email),
    // one live invitation per (workspace, email)
    uniqueIndex("workspace_invitation_pending_uq")
      .on(table.workspaceId, table.email)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`)
  ]
);

export const workspaceIntegration = pgTable(
  "workspace_integration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["slack", "teams"] }).notNull(),
    name: text("name").notNull(),
    webhookUrl: text("webhook_url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [uniqueIndex("workspace_integration_uq").on(table.workspaceId, table.provider)]
);

export const document = pgTable(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** Server-assigned, monotonically increasing; equals the highest persisted update version. */
    currentVersion: integer("current_version").notNull().default(0),
    snapshotVersion: integer("snapshot_version").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [index("document_workspace_idx").on(table.workspaceId, table.updatedAt.desc())]
);

export const documentUpdate = pgTable(
  "document_update",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    /** Server-assigned position in the document's log. */
    version: integer("version").notNull(),
    /** Client-chosen idempotency key. */
    updateId: text("update_id").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    clientId: text("client_id").notNull(),
    payload: bytea("payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    sourceInstanceId: text("source_instance_id").notNull(),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex("document_update_version_uq").on(table.documentId, table.version),
    uniqueIndex("document_update_idempotency_uq").on(table.documentId, table.updateId),
    index("document_update_actor_idx").on(table.actorId)
  ]
);

export const documentSnapshot = pgTable(
  "document_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    /** The snapshot contains every update with version <= this value. */
    version: integer("version").notNull(),
    state: bytea("state").notNull(),
    byteSize: integer("byte_size").notNull(),
    updatesSincePrevious: integer("updates_since_previous").notNull(),
    createdAt: createdAt()
  },
  (table) => [uniqueIndex("document_snapshot_version_uq").on(table.documentId, table.version)]
);

export const documentFavorite = pgTable(
  "document_favorite",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    createdAt: createdAt()
  },
  (table) => [primaryKey({ columns: [table.userId, table.documentId] })]
);

export const documentView = pgTable(
  "document_view",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.documentId] }),
    index("document_view_recent_idx").on(table.userId, table.viewedAt.desc())
  ]
);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspace.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text("ip_address"),
    createdAt: createdAt()
  },
  (table) => [
    index("audit_event_actor_idx").on(table.actorId, table.createdAt.desc()),
    index("audit_event_workspace_idx").on(table.workspaceId, table.createdAt.desc())
  ]
);
