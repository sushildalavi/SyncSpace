"use client";

import { useEffect, useState } from "react";
import type { CollabProvider } from "./provider";

export type RemoteUser = { id: number; name: string; color: string; userId: string; status: string };

/** Distinct collaborators (one entry per person, even with several tabs open). */
export function useRemoteUsers(provider: CollabProvider | null): RemoteUser[] {
  const [users, setUsers] = useState<RemoteUser[]>([]);
  useEffect(() => {
    if (!provider) {
      setUsers([]);
      return;
    }
    const refresh = () => {
      const byUser = new Map<string, RemoteUser>();
      for (const user of provider.remoteUsers()) {
        const existing = byUser.get(user.userId);
        if (!existing || user.status === "active") byUser.set(user.userId, user);
      }
      setUsers([...byUser.values()]);
    };
    refresh();
    provider.awareness.on("change", refresh);
    return () => provider.awareness.off("change", refresh);
  }, [provider]);
  return users;
}
