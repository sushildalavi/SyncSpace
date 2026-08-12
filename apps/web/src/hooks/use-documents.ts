"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useDocuments(token: string | null, workspaceId: string) {
  return useQuery({
    queryKey: ["documents", workspaceId, token],
    queryFn: () => apiFetch<Array<{ _id: string; title: string; currentVersion: number }>>(`/workspaces/${workspaceId}/documents`),
    enabled: Boolean(token && workspaceId)
  });
}
