"use client";

import { useParams, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { keys, useWorkspaces, type DocumentDetail } from "@/lib/queries";
import { useUi } from "@/stores/ui";

/** Workspace implied by the URL, falling back to the last one used, then the first one. */
export function useCurrentWorkspaceId(): string | null {
  const params = useParams<{ workspaceId?: string; documentId?: string }>();
  const pathname = usePathname();
  const client = useQueryClient();
  const last = useUi((s) => s.lastWorkspaceId);
  const { data } = useWorkspaces();

  if (params.workspaceId) return params.workspaceId;
  if (params.documentId && pathname.startsWith("/d/")) {
    const doc = client.getQueryData<DocumentDetail>(keys.document(params.documentId));
    if (doc) return doc.workspaceId;
  }
  if (last && data?.some((w) => w.id === last)) return last;
  return data?.[0]?.id ?? null;
}
