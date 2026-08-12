"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { openDB } from "idb";
import * as Y from "yjs";

type PresenceItem = {
  userId: string;
  userName: string;
  status: "active" | "idle" | "offline";
  color: string;
  cursor?: { anchor: number; head: number };
};

type CollaborationParams = {
  documentId: string;
  workspaceId: string;
  token: string | null;
  actorId: string;
};

type QueueItem = {
  id: string;
  message: unknown;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export function useCollaboration({ documentId, workspaceId, token, actorId }: CollaborationParams) {
  const socketRef = useRef<WebSocket | null>(null);
  const docRef = useRef<Y.Doc>(new Y.Doc());
  const textRef = useRef<Y.Text>(docRef.current.getText("body"));
  const [text, setTextState] = useState("");
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "offline" | "disconnected">("connecting");
  const [presence, setPresence] = useState<PresenceItem[]>([]);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [dbReady, setDbReady] = useState(false);
  const queueName = useMemo(() => `syncspace-queue-${documentId}`, [documentId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await openDB("syncspace-offline", 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("queues")) {
            db.createObjectStore("queues");
          }
        }
      });
      if (alive) {
        setDbReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const textType = textRef.current;
    const doc = docRef.current;
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === "remote") {
        return;
      }
      const update = Y.encodeStateAsUpdate(doc);
      void persistOrSend(queueName, {
        type: "document.update",
        payload: {
          eventId: crypto.randomUUID(),
          documentId,
          clientId: queueName,
          updateId: crypto.randomUUID(),
          version: currentVersion + 1,
          baseVersion: currentVersion,
          payload: btoa(String.fromCharCode(...update))
        }
      });
    };

    const onText = () => {
      setTextState(textType.toString());
    };

    doc.on("update", onUpdate);
    textType.observe(onText);

    return () => {
      doc.off("update", onUpdate);
      textType.unobserve(onText);
    };
  }, [actorId, currentVersion, documentId, queueName, workspaceId]);

  useEffect(() => {
    if (!token || !documentId || !dbReady || !workspaceId) {
      return;
    }

    const socket = new WebSocket(
      `${apiBase.replace(/^http/, "ws")}/collaboration?token=${encodeURIComponent(token)}&documentId=${encodeURIComponent(documentId)}&clientId=${encodeURIComponent(queueName)}`
    );
    socketRef.current = socket;
    (window as Window & { __syncspaceSocket?: WebSocket }).__syncspaceSocket = socket;

    socket.onopen = async () => {
      setConnectionState("connected");
      await flushQueue(queueName, socket);
    };

    socket.onclose = () => {
      setConnectionState(navigator.onLine ? "disconnected" : "offline");
    };

    socket.onerror = () => {
      setConnectionState("offline");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as { type: string; payload?: unknown };
      if (message.type === "document.snapshot" && message.payload && typeof message.payload === "object") {
        const payload = message.payload as { snapshot?: string; version?: number };
        if (payload.snapshot) {
          const update = Uint8Array.from(atob(payload.snapshot), (char) => char.charCodeAt(0));
          Y.applyUpdate(docRef.current, update, "remote");
          setTextState(textRef.current.toString());
        }
        if (typeof payload.version === "number") {
          setCurrentVersion(payload.version);
        }
      }
      if (message.type === "document.update" && message.payload && typeof message.payload === "object") {
        const payload = message.payload as { payload?: string; version?: number };
        if (payload.payload) {
          const update = Uint8Array.from(atob(payload.payload), (char) => char.charCodeAt(0));
          Y.applyUpdate(docRef.current, update, "remote");
          setTextState(textRef.current.toString());
        }
        if (typeof payload.version === "number") {
          setCurrentVersion(payload.version);
        }
      }
      if (message.type === "presence.update" && message.payload && typeof message.payload === "object") {
        setPresence((items) => upsertPresence(items, message.payload as PresenceItem));
      }
    };

    return () => {
      delete (window as Window & { __syncspaceSocket?: WebSocket }).__syncspaceSocket;
      socket.close();
    };
  }, [token, documentId, dbReady, queueName, workspaceId]);

  useEffect(() => {
    function handleOnline() {
      setConnectionState("connecting");
      socketRef.current?.close();
    }

    function handleOffline() {
      setConnectionState("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function setText(nextText: string) {
    const doc = docRef.current;
    const yText = textRef.current;
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, nextText);
    }, "local");
    setTextState(nextText);
  }

  async function reconnect() {
    socketRef.current?.close();
    setConnectionState("connecting");
  }

  return {
    text,
    setText,
    connectionState,
    presence,
    currentVersion,
    reconnect
  };
}

function upsertPresence(items: PresenceItem[], incoming: PresenceItem): PresenceItem[] {
  const next = items.filter((item) => item.userId !== incoming.userId);
  next.push(incoming);
  return next.sort((left, right) => left.userName.localeCompare(right.userName));
}

async function persistOrSend(queueName: string, message: unknown) {
  const socket = typeof window !== "undefined" ? (window as Window & { __syncspaceSocket?: WebSocket }).__syncspaceSocket : null;
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return;
  }
  await enqueue(queueName, message);
}

async function enqueue(queueName: string, message: unknown) {
  const db = await openDB("syncspace-offline", 1);
  const existing = ((await db.get("queues", queueName)) as QueueItem[] | undefined) ?? [];
  existing.push({ id: crypto.randomUUID(), message });
  await db.put("queues", existing, queueName);
}

async function flushQueue(queueName: string, socket: WebSocket) {
  const db = await openDB("syncspace-offline", 1);
  const queued = ((await db.get("queues", queueName)) as QueueItem[] | undefined) ?? [];
  for (const item of queued) {
    socket.send(JSON.stringify(item.message));
  }
  await db.put("queues", [], queueName);
}
