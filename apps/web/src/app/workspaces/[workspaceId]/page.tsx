"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { HaikeiBackdrop } from "@/components/haikei-backdrop";
import { useAuth } from "@/stores/auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDocuments } from "@/hooks/use-documents";

export default function WorkspacePage() {
  const params = useParams<{ workspaceId: string }>();
  const { token } = useAuth();
  const workspace = useWorkspace(token, params.workspaceId);
  const documents = useDocuments(token, params.workspaceId);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <HaikeiBackdrop />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col gap-4">
        <motion.header initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="glass-nav flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/workspaces" className="btn-secondary border-white/10 text-white">
              All workspaces
            </Link>
            <span className="pill">Workspace dashboard</span>
            <span className="text-sm text-slate-300">Docs, integrations, and members in one place</span>
          </div>
          <div className="flex gap-2">
            <Link href={`/workspaces/${params.workspaceId}/members`} className="btn-secondary border-white/10 text-white">
              Members
            </Link>
            <Link href={`/workspaces/${params.workspaceId}/integrations`} className="btn-primary">
              Integrations
            </Link>
          </div>
        </motion.header>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="surface p-6">
            <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/80">Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{workspace.data?.name ?? "Workspace"}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              A calm workspace home for writing, editing, aligning, and sending updates to the channels your team already uses.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/workspaces/${params.workspaceId}/members`} className="btn-secondary border-white/10 text-white">
                Manage members
              </Link>
              <Link href={`/workspaces/${params.workspaceId}/integrations`} className="btn-secondary border-white/10 text-white">
                Configure Slack / Teams
              </Link>
            </div>
          </motion.div>

          <motion.aside initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }} className="surface-strong p-6">
            <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/80">Workflow</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Designed like a doc hub, not a file browser</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>• Open a doc and focus on the paper surface.</p>
              <p>• Share decisions to Slack or Teams from the same screen.</p>
              <p>• Keep members and integrations close to the document flow.</p>
            </div>
          </motion.aside>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {documents.data?.map((doc) => (
            <motion.div key={doc._id} initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Link href={`/documents/${doc._id}`} className="group block rounded-[28px] border border-white/10 bg-white/5 p-6 transition hover:-translate-y-0.5 hover:bg-white/10">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Document</p>
                <h3 className="mt-3 text-xl font-semibold text-white">{doc.title}</h3>
                <p className="mt-2 text-sm text-slate-400">Version {doc.currentVersion}</p>
                <div className="mt-4 h-px w-full bg-white/10" />
                <p className="mt-4 text-sm text-cyan-200 group-hover:text-cyan-100">Open collaborative canvas →</p>
              </Link>
            </motion.div>
          ))}
        </section>
      </div>
    </main>
  );
}
