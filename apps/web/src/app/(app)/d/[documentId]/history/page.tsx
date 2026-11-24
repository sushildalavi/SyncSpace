"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, History, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { toast } from "sonner";
import { roleCan } from "@syncspace/contracts";
import { QueryError } from "@/components/app/error-state";
import { Page } from "@/components/app/page";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CollabEditor } from "@/components/editor/collab-editor";
import { api } from "@/lib/api";
import { invalidateAccess, useDocument, type HistoryEntry } from "@/lib/queries";
import { cn, timeAgo } from "@/lib/utils";

type HistoryResponse = { currentVersion: number; updates: HistoryEntry[]; snapshots: Array<{ version: number; byteSize: number }> };

export default function HistoryPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const meta = useDocument(documentId);
  const history = useQuery({ queryKey: ["history", documentId], queryFn: () => api<HistoryResponse>(`/documents/${documentId}/history`) });
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const router = useRouter();
  const client = useQueryClient();
  const version = selected ?? history.data?.updates[0]?.version ?? null;

  const preview = useQuery({
    queryKey: ["history", documentId, version],
    queryFn: () => api<{ version: number; state: string }>(`/documents/${documentId}/history/${version}`),
    enabled: version !== null
  });
  const previewDoc = useMemo(() => {
    const doc = new Y.Doc();
    if (preview.data) Y.applyUpdate(doc, Uint8Array.from(atob(preview.data.state), (c) => c.charCodeAt(0)));
    return doc;
  }, [preview.data]);
  useEffect(() => () => previewDoc.destroy(), [previewDoc]);

  const canRestore = roleCan(meta.data?.role, "document.write");
  const isLatest = version !== null && version === history.data?.currentVersion;

  async function restore() {
    if (version === null) return;
    setRestoring(true);
    try {
      const result = await api<{ unchanged: boolean; version: number }>(`/documents/${documentId}/restore`, { method: "POST", body: { version } });
      setConfirming(false);
      void client.invalidateQueries({ queryKey: ["history", documentId] });
      invalidateAccess(client, meta.data?.workspaceId);
      toast.success(result.unchanged ? `The document already matches version ${version}.` : `Restored version ${version} as a new version. You can restore a later one to undo it.`);
      router.push(`/d/${documentId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't restore that version");
    } finally {
      setRestoring(false);
    }
  }

  if (meta.isError) return <Page><QueryError error={meta.error} what="this document" /></Page>;

  return (
    <Page>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/d/${documentId}`}><ArrowLeft aria-hidden /> Back to document</Link>
        </Button>
        <h1 className="text-xl font-semibold">Version history{meta.data ? <span className="font-normal text-muted-foreground"> · {meta.data.title}</span> : null}</h1>
      </div>

      {history.isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : history.isError ? (
        <QueryError error={history.error} retry={() => void history.refetch()} what="the history" />
      ) : history.data && history.data.updates.length === 0 ? (
        <EmptyState icon={History} title="No edits yet" description="Every saved change will be listed here with who made it and when." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <nav aria-label="Versions" className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface shadow-xs">
            <ul>
              {history.data?.updates.map((entry) => (
                <li key={entry.version} className="border-b border-border last:border-b-0">
                  <button
                    onClick={() => setSelected(entry.version)}
                    aria-current={entry.version === version ? "true" : undefined}
                    className={cn("flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/70", entry.version === version && "bg-primary-soft")}
                  >
                    <Avatar name={entry.actorName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{entry.actorName}</span>
                      <span className="block text-xs text-muted-foreground">{timeAgo(entry.createdAt)} · v{entry.version}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <section aria-label="Version preview" className="min-w-0 rounded-lg border border-border bg-surface p-6 shadow-xs sm:p-8">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">Read-only preview of version {version}. It shows the document as it was after that change.</p>
              {canRestore && !isLatest ? (
                <Button size="sm" onClick={() => setConfirming(true)}>
                  <RotateCcw aria-hidden /> Restore this version
                </Button>
              ) : null}
            </div>
            {preview.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : preview.isError ? (
              <QueryError error={preview.error} what="that version" />
            ) : (
              <CollabEditor key={preview.data?.version} doc={previewDoc} provider={null} user={{ name: "", color: "#000" }} readOnly />
            )}
          </section>
        </div>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore version {version}?</DialogTitle>
            <DialogDescription>
              The document will read as it did after that change. This is saved as a new version, so nothing is lost: restore a later version to undo it. Anyone editing right now sees it live.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" loading={restoring} onClick={() => void restore()}>
              Restore version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
