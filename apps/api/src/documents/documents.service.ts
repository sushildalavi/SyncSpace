import { ForbiddenException, Injectable, NotFoundException, Inject } from "@nestjs/common";
import { createHash } from "crypto";
import { DatabaseService } from "../database/database.service.js";
import { WorkspacesService } from "../workspaces/workspaces.service.js";
import { createYDoc, applyDocumentUpdate, encodeDocumentState } from "@syncspace/collaboration";
import * as Y from "yjs";

@Injectable()
export class DocumentsService {
  private readonly snapshotThreshold = 25;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(WorkspacesService) private readonly workspacesService: WorkspacesService
  ) {}

  async list(workspaceId: string, userId: string) {
    await this.workspacesService.requireMembership(workspaceId, userId);
    return this.database.models.documents.find({ workspaceId, deletedAt: null }).sort({ updatedAt: -1 }).lean();
  }

  async create(workspaceId: string, title: string, userId: string) {
    await this.workspacesService.requireMembership(workspaceId, userId, ["owner", "editor"]);
    return this.database.models.documents.create({
      workspaceId,
      title,
      createdBy: userId,
      updatedBy: userId
    });
  }

  async getDocument(documentId: string, userId: string) {
    const document = await this.database.models.documents.findById(documentId).lean();
    if (!document || document.deletedAt) {
      throw new NotFoundException("Document not found");
    }
    await this.workspacesService.requireMembership(document.workspaceId, userId);
    return document;
  }

  async loadDocumentStateWithoutAuth(documentId: string) {
    const document = await this.database.models.documents.findById(documentId).lean();
    if (!document || document.deletedAt) {
      throw new NotFoundException("Document not found");
    }

    const doc = createYDoc();
    const snapshot = await this.database.models.snapshots.findOne({ documentId }).sort({ version: -1 }).lean();
    if (snapshot) {
      applyDocumentUpdate(doc, new Uint8Array(snapshot.stateBlob as unknown as Buffer));
    }
    const updates = await this.database.models.updates.find({ documentId }).sort({ receivedAt: 1 }).lean();
    for (const update of updates) {
      applyDocumentUpdate(doc, new Uint8Array(update.payload as unknown as Buffer));
    }
    return { doc, document };
  }

  async listVersions(documentId: string, userId: string) {
    const document = await this.getDocument(documentId, userId);
    const snapshots = await this.database.models.snapshots.find({ documentId }).sort({ version: -1 }).lean();
    const updates = await this.database.models.updates.find({ documentId }).sort({ receivedAt: -1 }).limit(100).lean();
    return { document, snapshots, updates };
  }

  async loadDocumentState(
    documentId: string,
    userId: string
  ): Promise<{ doc: Y.Doc; document: { _id: string; workspaceId: string; currentVersion: number; updatedBy: string } }> {
    const document = await this.getDocument(documentId, userId);
    await this.workspacesService.requireMembership(document.workspaceId, userId);
    return this.loadDocumentStateWithoutAuth(documentId);
  }

  async persistUpdate(params: {
    documentId: string;
    workspaceId: string;
    actorId: string;
    clientId: string;
    updateId: string;
    baseVersion: number;
    version: number;
    payload: Uint8Array;
    sourceInstanceId: string;
  }) {
    const document = await this.database.models.documents.findById(params.documentId);
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    if (document.workspaceId !== params.workspaceId) {
      throw new ForbiddenException("Document workspace mismatch");
    }

    const payloadHash = createHash("sha256").update(params.payload).digest("hex");
    try {
      const record = await this.database.models.updates.create({
        documentId: params.documentId,
        updateId: params.updateId,
        actorId: params.actorId,
        clientId: params.clientId,
        baseVersion: params.baseVersion,
        version: params.version,
        payload: Buffer.from(params.payload),
        payloadHash,
        sourceInstanceId: params.sourceInstanceId,
        receivedAt: new Date(),
        appliedAt: new Date()
      });
      document.currentVersion = Math.max(document.currentVersion, params.version);
      document.updatedBy = params.actorId;
      await document.save();
      return { record, duplicate: false as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("duplicate key")) {
        return { record: null, duplicate: true as const };
      }
      throw error;
    }
  }

  async snapshotIfNeeded(documentId: string): Promise<boolean> {
    const updatesCount = await this.database.models.updates.countDocuments({ documentId });
    if (updatesCount < this.snapshotThreshold) {
      return false;
    }

    const loaded = await this.loadDocumentStateWithoutAuth(documentId);
    const serialized = encodeDocumentState(loaded.doc);
    const latest = await this.database.models.documents.findById(documentId);
    if (!latest) {
      return false;
    }

    const snapshot = await this.database.models.snapshots.create({
      documentId,
      version: latest.currentVersion,
      snapshotType: "yjs",
      stateBlob: Buffer.from(serialized),
      byteSize: serialized.byteLength,
      operationCountSincePrevious: updatesCount
    });

    latest.snapshotId = snapshot._id;
    latest.snapshotVersion = latest.currentVersion;
    await latest.save();
    return true;
  }
}
