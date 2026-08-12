"use client";

import { useWorkspace } from "@/hooks/use-workspace";
import { useDocuments } from "@/hooks/use-documents";
import { useAuth } from "@/stores/auth";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function WorkspacePage() {
  const params = useParams<{ workspaceId: string }>();
  const { token } = useAuth();
  const workspace = useWorkspace(token, params.workspaceId);
  const documents = useDocuments(token, params.workspaceId);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Workspace dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{workspace.data?.name ?? "Workspace"}</h1>
        <div className="mt-4 flex gap-3">
          <Link
            href={`/workspaces/${params.workspaceId}/members`}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200"
          >
            Members
          </Link>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-white">Documents</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {documents.data?.map((doc) => (
            <Link
              key={doc._id}
              href={`/documents/${doc._id}`}
              className="rounded-3xl border border-white/10 bg-slate-950/50 p-5 transition hover:bg-slate-900/70"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Document</p>
              <h3 className="mt-3 text-xl font-semibold text-white">{doc.title}</h3>
              <p className="mt-2 text-sm text-slate-400">Version {doc.currentVersion}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
