"use client";

import { useDocumentHistory } from "@/hooks/use-document-history";
import { useAuth } from "@/stores/auth";
import { useParams } from "next/navigation";

export default function HistoryPage() {
  const params = useParams<{ documentId: string }>();
  const { token } = useAuth();
  const history = useDocumentHistory(token, params.documentId);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Version history</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Document history</h1>
        <div className="mt-6 space-y-4">
          {history.data?.snapshots.map((snapshot) => (
            <div key={snapshot._id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-sm text-white">Snapshot version {snapshot.version}</p>
              <p className="text-xs text-slate-400">{new Date(snapshot.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
