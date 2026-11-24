"use client";

import { useQueryClient } from "@tanstack/react-query";
import { History, LogIn, Star, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { presenceColorFor, roleCan } from "@syncspace/contracts";
import { QueryError } from "@/components/app/error-state";
import { Page } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { CollabEditor } from "@/components/editor/collab-editor";
import { PresenceAvatars } from "@/components/editor/presence-avatars";
import { ShareDialog } from "@/components/editor/share-dialog";
import { SyncStatus } from "@/components/editor/sync-status";
import { TitleInput } from "@/components/editor/title-input";
import { useSession } from "@/lib/auth-client";
import { useCollab } from "@/lib/collab/use-collab";
import { useRemoteUsers } from "@/lib/collab/use-remote-users";
import { invalidateAccess, useDocument, useToggleFavorite } from "@/lib/queries";
import { cn } from "@/lib/utils";

export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { data: session } = useSession();
  const meta = useDocument(documentId);
  const client = useQueryClient();
  const favorite = useToggleFavorite();
  const self = session ? { name: session.user.name, color: presenceColorFor(session.user.id), image: session.user.image ?? null } : null;
  // The socket only opens once the API has confirmed this user may read the document.
  const { doc, provider, status } = useCollab(documentId, meta.data && self ? self : null);
  const remote = useRemoteUsers(provider);
  const [everSynced, setEverSynced] = useState(false);
  const lastRole = useRef<string | null>(null);

  useEffect(() => {
    if (status.synced) setEverSynced(true);
  }, [status.synced]);

  // A live role change or revocation must be reflected everywhere, not just in the editor.
  useEffect(() => {
    if (status.role && lastRole.current && status.role !== lastRole.current) invalidateAccess(client, meta.data?.workspaceId);
    if (status.role) lastRole.current = status.role;
  }, [status.role, client, meta.data?.workspaceId]);
  useEffect(() => {
    if (status.closedReason) invalidateAccess(client, meta.data?.workspaceId);
  }, [status.closedReason, client, meta.data?.workspaceId]);

  if (meta.isError) return <Page narrow><QueryError error={meta.error} what="this document" /></Page>;

  const role = status.role ?? meta.data?.role ?? null;
  const readOnly = !roleCan(role, "document.write") || Boolean(status.closedReason);
  const canTitle = roleCan(role, "document.write") && !status.closedReason;
  const stickyTop = "top-0";

  return (
    <div className="flex min-h-full flex-col">
      <header className={cn("sticky z-20 border-b border-border bg-background/90 backdrop-blur", stickyTop)}>
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 sm:px-8">
          <div className="min-w-0 flex-1 basis-56">
            {meta.data ? (
              <TitleInput documentId={documentId} workspaceId={meta.data.workspaceId} title={meta.data.title} editable={canTitle} />
            ) : (
              <Skeleton className="h-7 w-56" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {self ? <PresenceAvatars users={remote} self={self} /> : null}
            <SyncStatus status={status} readOnly={!roleCan(role, "document.write")} />
            {meta.data ? (
              <>
                <Tooltip label={meta.data.isFavorite ? "Remove from favorites" : "Add to favorites"}>
                  <Button variant="ghost" size="icon-sm" aria-label={meta.data.isFavorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={meta.data.isFavorite} disabled={favorite.isPending} onClick={() => favorite.mutate({ id: documentId, favorite: !meta.data!.isFavorite })}>
                    <Star className={cn(meta.data.isFavorite && "fill-warning text-warning")} aria-hidden />
                  </Button>
                </Tooltip>
                <Tooltip label="Version history">
                  <Button asChild variant="ghost" size="icon-sm">
                    <Link href={`/d/${documentId}/history`} aria-label="Version history"><History aria-hidden /></Link>
                  </Button>
                </Tooltip>
                {role ? <ShareDialog workspaceId={meta.data.workspaceId} documentId={documentId} role={role} /> : null}
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
        {status.closedReason ? (
          <div role="alert" className="mb-6 flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-warning sm:flex-row sm:items-center">
            <TriangleAlert className="hidden size-5 shrink-0 sm:block" aria-hidden />
            <p className="flex-1 text-sm font-medium">{status.closedReason}</p>
            <Button asChild size="sm">
              <Link href={status.closedCode === 4401 || status.closedCode === 4411 ? `/sign-in?next=/d/${documentId}` : "/"}>
                <LogIn aria-hidden /> {status.closedCode === 4401 || status.closedCode === 4411 ? "Sign in" : "Go home"}
              </Link>
            </Button>
          </div>
        ) : null}

        {!status.closedReason && !roleCan(role, "document.write") && role ? (
          <p role="note" className="mb-6 rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">
            You have <strong className="font-medium text-foreground">view-only</strong> access. You&apos;ll see changes live, but editing needs the editor role.
          </p>
        ) : null}

        {status.editsRejected && roleCan(role, "document.write") ? (
          <p role="alert" className="mb-6 rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-2.5 text-sm text-destructive">Some changes couldn&apos;t be saved. Reload the page to continue from the saved version.</p>
        ) : null}

        {!everSynced && status.connection === "offline" ? (
          <p role="alert" className="rounded-lg border border-border bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">You&apos;re offline and this document hasn&apos;t been opened on this device yet. Reconnect to load it.</p>
        ) : !everSynced && !status.closedReason ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading document">
            <Skeleton className="h-9 w-3/5" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-11/12" />
            <Skeleton className="h-5 w-4/5" />
          </div>
        ) : self && provider ? (
          <CollabEditor doc={doc} provider={provider} user={self} readOnly={readOnly} toolbarClassName="sm:sticky sm:top-[3.5rem] sm:z-10" />
        ) : null}
      </div>
    </div>
  );
}
