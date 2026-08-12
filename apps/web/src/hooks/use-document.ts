"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useDocument(token: string | null, documentId: string) {
  return useQuery({
    queryKey: ["document", documentId, token],
    queryFn: () => apiFetch<{ _id: string; title: string; workspaceId: string; currentVersion: number }>(`/documents/${documentId}`),
    enabled: Boolean(token && documentId)
  });
}
