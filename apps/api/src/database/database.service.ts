import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import mongoose, { type Connection, type Model } from "mongoose";
import {
  DocumentSchema,
  DocumentSnapshotSchema,
  DocumentUpdateSchema,
  SessionSchema,
  UserSchema,
  WorkspaceIntegrationSchema,
  WorkspaceMembershipSchema,
  WorkspaceSchema,
  type DocumentRecord,
  type DocumentSnapshotRecord,
  type DocumentUpdateRecord,
  type SessionRecord,
  type UserRecord,
  type WorkspaceIntegrationRecord,
  type WorkspaceMembershipRecord,
  type WorkspaceRecord
} from "./schemas.js";
import { APP_ENV } from "../shared/app-env.js";
import { Inject } from "@nestjs/common";

export type DatabaseModels = {
  users: Model<UserRecord>;
  workspaces: Model<WorkspaceRecord>;
  memberships: Model<WorkspaceMembershipRecord>;
  integrations: Model<WorkspaceIntegrationRecord>;
  documents: Model<DocumentRecord>;
  snapshots: Model<DocumentSnapshotRecord>;
  updates: Model<DocumentUpdateRecord>;
  sessions: Model<SessionRecord>;
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private connection?: Connection;
  private modelCache?: DatabaseModels;

  constructor(@Inject(APP_ENV) private readonly env: { DATABASE_URL: string }) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    this.connection = await mongoose.createConnection(this.env.DATABASE_URL).asPromise();
    this.modelCache = {
      users: this.connection.model("User", UserSchema),
      workspaces: this.connection.model("Workspace", WorkspaceSchema),
      memberships: this.connection.model("WorkspaceMembership", WorkspaceMembershipSchema),
      integrations: this.connection.model("WorkspaceIntegration", WorkspaceIntegrationSchema),
      documents: this.connection.model("Document", DocumentSchema),
      snapshots: this.connection.model("DocumentSnapshot", DocumentSnapshotSchema),
      updates: this.connection.model("DocumentUpdate", DocumentUpdateSchema),
      sessions: this.connection.model("Session", SessionSchema)
    };

    await Promise.all(Object.values(this.modelCache).map(async (model) => model.init()));
    this.logger.log("MongoDB connected and models initialized");
  }

  get models(): DatabaseModels {
    if (!this.modelCache) {
      throw new Error("Database not connected");
    }
    return this.modelCache;
  }
}
