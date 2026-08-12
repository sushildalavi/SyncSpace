"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useDocumentHistory(token: string | null, documentId: string) {
  return useQuery({
    queryKey: ["document-history", documentId, token],
    queryFn: () => apiFetch<{ snapshots: Array<{ _id: string; version: number; createdAt: string }> }>(`/documents/${documentId}/versions`),
    enabled: Boolean(token && documentId)
  });
}
