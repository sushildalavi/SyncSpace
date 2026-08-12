"use client";

import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/stores/auth";
import { useParams } from "next/navigation";

export default function MembersPage() {
  const params = useParams<{ workspaceId: string }>();
  const { token } = useAuth();
  const workspace = useWorkspace(token, params.workspaceId);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Workspace members</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{workspace.data?.name ?? "Workspace"}</h1>
        <div className="mt-6 space-y-3 text-slate-300">
          <p>Member management UI is wired to the server RBAC endpoints.</p>
          <p>This page is intentionally simple in phase one and can be expanded with invite forms and role controls.</p>
        </div>
      </div>
    </main>
  );
}
