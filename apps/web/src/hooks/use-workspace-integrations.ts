"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type WorkspaceIntegration = {
  _id: string;
  workspaceId: string;
  provider: "slack" | "teams";
  name: string;
  webhookUrl: string;
  enabled: boolean;
};

export function useWorkspaceIntegrations(token: string | null, workspaceId: string) {
  return useQuery({
    queryKey: ["workspace-integrations", workspaceId, token],
    queryFn: () => apiFetch<Array<WorkspaceIntegration>>(`/workspaces/${workspaceId}/integrations`),
    enabled: Boolean(token && workspaceId)
  });
}
