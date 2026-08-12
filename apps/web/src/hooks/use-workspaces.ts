"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function useWorkspaces(token: string | null) {
  return useQuery({
    queryKey: ["workspaces", token],
    queryFn: () => apiFetch<Array<{ _id: string; name: string; membership?: { role: string } }>>("/workspaces"),
    enabled: Boolean(token)
  });
}
