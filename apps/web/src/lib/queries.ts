"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Permission, ShareRole, WorkspaceRole } from "@syncspace/contracts";
import { api } from "./api";

export type Workspace = {
  id: string;
  name: string;
  role: WorkspaceRole;
  documentCount: number;
  memberCount: number;
  createdAt: string;
};
export type WorkspaceDetail = { id: string; name: string; role: WorkspaceRole; permissions: Permission[]; createdAt: string };
export type DocumentSummary = { id: string; workspaceId: string; title: string; updatedAt: string; isFavorite: boolean };
export type DocumentDetail = {
  id: string;
  workspaceId: string;
  title: string;
  role: WorkspaceRole;
  permissions: Permission[];
  /** Null when access comes only from a direct share. */
  workspaceRole: WorkspaceRole | null;
  isFavorite: boolean;
  currentVersion: number;
  updatedAt: string;
};
export type DocLink = { id: string; workspaceId: string; workspaceName: string; title: string };
export type Member = { userId: string; name: string; email: string; image: string | null; role: WorkspaceRole; joinedAt: string };
export type Invitation = { id: string; email: string; role: WorkspaceRole; expiresAt: string; createdAt: string };
export type MyInvitation = { id: string; role: WorkspaceRole; expiresAt: string; workspaceId: string; workspaceName: string; invitedByName: string };
export type DocumentShare = { id: string; email: string; role: ShareRole; createdAt: string };
export type PublicConfig = { googleEnabled: boolean; requireEmailVerification: boolean };
export type HistoryEntry = { version: number; actorId: string; actorName: string; createdAt: string };
export type Integration = { id: string; provider: "slack" | "teams"; name: string; enabled: boolean; webhookHint: string };
export type SecurityEvent = { id: string; type: string; createdAt: string; metadata: Record<string, unknown> };

export const keys = {
  workspaces: ["workspaces"] as const,
  workspace: (id: string) => ["workspace", id] as const,
  documents: (workspaceId: string) => ["documents", workspaceId] as const,
  document: (id: string) => ["document", id] as const,
  members: (id: string) => ["members", id] as const,
  invitations: (id: string) => ["invitations", id] as const,
  myInvitations: ["my-invitations"] as const,
  recent: ["recent"] as const,
  favorites: ["favorites"] as const,
  shared: ["shared-with-me"] as const,
  shares: (documentId: string) => ["shares", documentId] as const,
  config: ["config"] as const
};

export const useConfig = () => useQuery({ queryKey: keys.config, queryFn: () => api<PublicConfig>("/config"), staleTime: 5 * 60_000 });
export const useWorkspaces = () => useQuery({ queryKey: keys.workspaces, queryFn: () => api<Workspace[]>("/workspaces") });
export const useWorkspace = (id: string) => useQuery({ queryKey: keys.workspace(id), queryFn: () => api<WorkspaceDetail>(`/workspaces/${id}`), retry: false });
/** An empty id means no workspace is selected yet, so there is nothing to request. */
export const useDocuments = (workspaceId: string) =>
  useQuery({ queryKey: keys.documents(workspaceId), queryFn: () => api<DocumentSummary[]>(`/workspaces/${workspaceId}/documents`), enabled: workspaceId !== "" });
export const useDocument = (id: string) => useQuery({ queryKey: keys.document(id), queryFn: () => api<DocumentDetail>(`/documents/${id}`), retry: false });
export const useMembers = (id: string) => useQuery({ queryKey: keys.members(id), queryFn: () => api<Member[]>(`/workspaces/${id}/members`) });
export const useInvitations = (id: string, enabled: boolean) =>
  useQuery({ queryKey: keys.invitations(id), queryFn: () => api<Invitation[]>(`/workspaces/${id}/invitations`), enabled });
export const useMyInvitations = () => useQuery({ queryKey: keys.myInvitations, queryFn: () => api<MyInvitation[]>("/invitations") });
export const useRecent = () => useQuery({ queryKey: keys.recent, queryFn: () => api<DocLink[]>("/documents/recent") });
export const useFavorites = () => useQuery({ queryKey: keys.favorites, queryFn: () => api<DocLink[]>("/documents/favorites") });
export const useSharedWithMe = () => useQuery({ queryKey: keys.shared, queryFn: () => api<DocLink[]>("/documents/shared") });
export const useShares = (documentId: string, enabled: boolean) =>
  useQuery({ queryKey: keys.shares(documentId), queryFn: () => api<DocumentShare[]>(`/documents/${documentId}/shares`), enabled });
export const useSearch = (q: string) =>
  useQuery({ queryKey: ["search", q], queryFn: () => api<DocLink[]>(`/search?q=${encodeURIComponent(q)}`), enabled: q.trim().length > 0, staleTime: 15_000 });

export function useCreateWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<Workspace>("/workspaces", { method: "POST", body: { name } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.workspaces })
  });
}

export function useCreateDocument(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api<{ id: string }>(`/workspaces/${workspaceId}/documents`, { method: "POST", body: { title } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.documents(workspaceId) });
      void client.invalidateQueries({ queryKey: keys.workspaces });
    }
  });
}

export function useToggleFavorite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => api(`/documents/${id}/favorite`, { method: favorite ? "PUT" : "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.favorites });
      void client.invalidateQueries({ queryKey: ["documents"] });
      void client.invalidateQueries({ queryKey: ["document"] });
    }
  });
}

export function invalidateAccess(client: ReturnType<typeof useQueryClient>, workspaceId?: string) {
  void client.invalidateQueries({ queryKey: keys.workspaces });
  if (workspaceId) {
    void client.invalidateQueries({ queryKey: keys.workspace(workspaceId) });
    void client.invalidateQueries({ queryKey: keys.members(workspaceId) });
    void client.invalidateQueries({ queryKey: keys.invitations(workspaceId) });
  }
  void client.invalidateQueries({ queryKey: ["document"] });
  void client.invalidateQueries({ queryKey: keys.recent });
  void client.invalidateQueries({ queryKey: keys.favorites });
  void client.invalidateQueries({ queryKey: keys.shared });
}
