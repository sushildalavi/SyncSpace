"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useWorkspace(token: string | null, workspaceId: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId, token],
    queryFn: () => apiFetch<{ _id: string; name: string }>(`/workspaces/${workspaceId}`),
    enabled: Boolean(token && workspaceId)
  });
}
