import { randomUUID } from "crypto";
import { Schema, type InferSchemaType } from "mongoose";

const id = {
  type: String,
  default: () => randomUUID()
};

export const UserSchema = new Schema(
  {
    _id: id,
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: false },
    displayName: { type: String, required: true, trim: true },
    avatarUrl: { type: String, required: false }
  },
  { timestamps: true, versionKey: false }
);

export type UserRecord = InferSchemaType<typeof UserSchema> & { _id: string };

export const WorkspaceSchema = new Schema(
  {
    _id: id,
    name: { type: String, required: true, trim: true },
    ownerId: { type: String, required: true, index: true },
    archivedAt: { type: Date, required: false }
  },
  { timestamps: true, versionKey: false }
);

WorkspaceSchema.index({ ownerId: 1, createdAt: -1 });

export type WorkspaceRecord = InferSchemaType<typeof WorkspaceSchema> & { _id: string };

export const WorkspaceMembershipSchema = new Schema(
  {
    _id: id,
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, required: true, enum: ["owner", "editor", "viewer"] },
    invitedBy: { type: String, required: false }
  },
  { timestamps: true, versionKey: false }
);

WorkspaceMembershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
WorkspaceMembershipSchema.index({ userId: 1, role: 1 });

export type WorkspaceMembershipRecord = InferSchemaType<typeof WorkspaceMembershipSchema> & { _id: string };

export const WorkspaceIntegrationSchema = new Schema(
  {
    _id: id,
    workspaceId: { type: String, required: true, index: true },
    provider: { type: String, required: true, enum: ["slack", "teams"] },
    name: { type: String, required: true, trim: true },
    webhookUrl: { type: String, required: true, trim: true },
    enabled: { type: Boolean, required: true, default: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String, required: true }
  },
  { timestamps: true, versionKey: false }
);

WorkspaceIntegrationSchema.index({ workspaceId: 1, provider: 1 }, { unique: true });
WorkspaceIntegrationSchema.index({ workspaceId: 1, enabled: 1 });

export type WorkspaceIntegrationRecord = InferSchemaType<typeof WorkspaceIntegrationSchema> & { _id: string };

export const DocumentSchema = new Schema(
  {
    _id: id,
    workspaceId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String, required: true },
    currentVersion: { type: Number, required: true, default: 0 },
    snapshotVersion: { type: Number, required: true, default: 0 },
    snapshotId: { type: String, required: false },
    deletedAt: { type: Date, required: false }
  },
  { timestamps: true, versionKey: false }
);

DocumentSchema.index({ workspaceId: 1, updatedAt: -1 });
DocumentSchema.index({ workspaceId: 1, title: 1 });

export type DocumentRecord = InferSchemaType<typeof DocumentSchema> & { _id: string };

export const DocumentSnapshotSchema = new Schema(
  {
    _id: id,
    documentId: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    snapshotType: { type: String, required: true, default: "yjs" },
    stateBlob: { type: Buffer, required: true },
    byteSize: { type: Number, required: true },
    operationCountSincePrevious: { type: Number, required: true }
  },
  { timestamps: true, versionKey: false }
);

DocumentSnapshotSchema.index({ documentId: 1, version: -1 }, { unique: true });

export type DocumentSnapshotRecord = InferSchemaType<typeof DocumentSnapshotSchema> & { _id: string };

export const DocumentUpdateSchema = new Schema(
  {
    _id: id,
    documentId: { type: String, required: true, index: true },
    updateId: { type: String, required: true },
    actorId: { type: String, required: true, index: true },
    clientId: { type: String, required: true },
    baseVersion: { type: Number, required: true },
    version: { type: Number, required: true },
    payload: { type: Buffer, required: true },
    payloadHash: { type: String, required: true },
    receivedAt: { type: Date, required: true, default: () => new Date() },
    appliedAt: { type: Date, required: false },
    sourceInstanceId: { type: String, required: true }
  },
  { timestamps: true, versionKey: false }
);

DocumentUpdateSchema.index({ documentId: 1, updateId: 1 }, { unique: true });
DocumentUpdateSchema.index({ documentId: 1, receivedAt: 1 });

export type DocumentUpdateRecord = InferSchemaType<typeof DocumentUpdateSchema> & { _id: string };

export const SessionSchema = new Schema(
  {
    _id: id,
    userId: { type: String, required: true, index: true },
    jti: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, required: false }
  },
  { timestamps: true, versionKey: false }
);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionRecord = InferSchemaType<typeof SessionSchema> & { _id: string };
