"use client";

import { CollaborativeEditor } from "@/components/collaborative-editor";
import { HaikeiBackdrop } from "@/components/haikei-backdrop";
import { useAuth } from "@/stores/auth";
import { useDocument } from "@/hooks/use-document";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";

export default function DocumentPage() {
  const params = useParams<{ documentId: string }>();
  const { token } = useAuth();
  const document = useDocument(token, params.documentId);
  const workspaceId = document.data?.workspaceId;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <HaikeiBackdrop />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1600px] flex-col gap-4">
        <motion.header initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }} className="glass-nav flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {workspaceId ? (
              <Link href={`/workspaces/${workspaceId}`} className="btn-secondary border-white/10 text-white">
                Back to workspace
              </Link>
            ) : (
              <span className="btn-secondary border-white/10 text-white/70">Loading workspace…</span>
            )}
            <span className="pill">Collaborative editor</span>
            <span className="text-sm text-slate-300">Drafting space • live sync • decision ready</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="pill">{document.data?.title ?? "Document"}</span>
          </div>
        </motion.header>

        <motion.section initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }} className="grid gap-4">
          <div className="surface p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/80">Document</p>
            <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{document.data?.title ?? "Document"}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Write the doc, align the team, and publish the important parts to Slack or Teams without leaving the workspace.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="pill border-white/10 bg-white/5 text-slate-200">Version {document.data?.currentVersion ?? "—"}</span>
              {workspaceId ? (
                <Link href={`/documents/${params.documentId}/history`} className="pill border-white/10 bg-cyan-400/10 text-cyan-100">
                  View history
                </Link>
              ) : null}
            </div>
          </div>
          {workspaceId ? (
            <CollaborativeEditor documentId={params.documentId} workspaceId={workspaceId} />
          ) : (
            <div className="surface p-6 text-slate-300">Loading document…</div>
          )}
        </motion.section>
      </div>
    </main>
  );
}
