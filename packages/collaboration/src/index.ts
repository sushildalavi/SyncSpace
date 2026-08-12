import * as Y from "yjs";

export type CollaborationEnvelope = {
  eventId: string;
  documentId: string;
  workspaceId: string;
  actorId: string;
  clientId: string;
  updateId: string;
  version: number;
  baseVersion: number;
  payload: Uint8Array;
};

export type SnapshotEnvelope = {
  documentId: string;
  version: number;
  stateVector: Uint8Array;
  snapshot: Uint8Array;
};

export function createYDoc(): Y.Doc {
  return new Y.Doc();
}

export function encodeDocumentState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function applyDocumentUpdate(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update);
}

export function mergeDocumentUpdates(updates: Uint8Array[]): Uint8Array {
  return Y.mergeUpdates(updates);
}

export function snapshotDocument(doc: Y.Doc): SnapshotEnvelope {
  return {
    documentId: "",
    version: 0,
    stateVector: Y.encodeStateVector(doc),
    snapshot: Y.encodeStateAsUpdate(doc)
  };
}
