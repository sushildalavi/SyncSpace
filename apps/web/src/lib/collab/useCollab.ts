"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { WS_BASE_URL } from "../env";
import { CollabProvider, type CollabStatus } from "./provider";

const SERVER_STATUS: CollabStatus = { connection: "connecting", closedReason: null, closedCode: null, synced: false, role: null, pending: 0, lastSavedAt: null, editsRejected: false };

/** Owns the Y.Doc and socket for one document for as long as the component is mounted. */
export function useCollab(documentId: string, user: { name: string; color: string } | null) {
  const doc = useMemo(() => new Y.Doc(), [documentId]);
  const [provider, setProvider] = useState<CollabProvider | null>(null);
  const userName = user?.name;
  const userColor = user?.color;

  useEffect(() => {
    if (!userName || !userColor) return;
    const next = new CollabProvider({ documentId, baseUrl: WS_BASE_URL, doc, user: { name: userName, color: userColor } });
    setProvider(next);
    return () => {
      setProvider(null);
      next.destroy();
    };
  }, [documentId, doc, userName, userColor]);

  const status = useSyncExternalStore(
    (listener) => (provider ? provider.subscribe(listener) : () => undefined),
    () => provider?.getStatus() ?? SERVER_STATUS,
    () => SERVER_STATUS
  );

  return { doc, provider, status };
}
