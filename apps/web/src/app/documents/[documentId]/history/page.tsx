"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { HaikeiBackdrop } from "@/components/haikei-backdrop";
import { useDocumentHistory } from "@/hooks/use-document-history";
import { useAuth } from "@/stores/auth";

export default function HistoryPage() {
  const params = useParams<{ documentId: string }>();
  const { token } = useAuth();
  const history = useDocumentHistory(token, params.documentId);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <HaikeiBackdrop />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl flex-col gap-4">
        <motion.header initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="glass-nav flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href={`/documents/${params.documentId}`} className="btn-secondary border-white/10 text-white">
              Back to doc
            </Link>
            <span className="pill">History</span>
          </div>
          <span className="text-sm text-slate-300">Snapshots and version memory</span>
        </motion.header>

        <motion.section initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="surface p-6">
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/80">Version history</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Document history</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Every snapshot tells part of the story. Use this view when you want to compare how the doc evolved over time or revisit a stable version.
          </p>

          <div className="mt-6 space-y-4">
            {history.data?.snapshots.map((snapshot, index) => (
              <div key={snapshot._id} className="rounded-[24px] border border-white/10 bg-slate-950/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Snapshot {index + 1}</p>
                    <p className="mt-1 text-lg font-semibold text-white">Version {snapshot.version}</p>
                  </div>
                  <p className="text-sm text-slate-400">{new Date(snapshot.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      </div>
    </main>
  );
}
