"use client";

import { CollaborativeEditor } from "@/components/collaborative-editor";
import { useAuth } from "@/stores/auth";
import { useDocument } from "@/hooks/use-document";
import { useParams } from "next/navigation";

export default function DocumentPage() {
  const params = useParams<{ documentId: string }>();
  const { token } = useAuth();
  const document = useDocument(token, params.documentId);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <header className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Collaborative editor</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{document.data?.title ?? "Document"}</h1>
      </header>

      <div className="mt-8">
        <CollaborativeEditor documentId={params.documentId} workspaceId={document.data?.workspaceId ?? ""} />
      </div>
    </main>
  );
}
