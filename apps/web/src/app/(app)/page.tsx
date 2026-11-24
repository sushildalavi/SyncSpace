"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Clock, FolderOpen, MailPlus, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreateWorkspaceForm } from "@/components/app/create-workspace-dialog";
import { DocumentList, DocumentRow } from "@/components/app/document-row";
import { QueryError } from "@/components/app/error-state";
import { Page, PageHeader, RoleBadgeLabel, Section } from "@/components/app/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { invalidateAccess, useFavorites, useMyInvitations, useRecent, useWorkspaces } from "@/lib/queries";
import { useState } from "react";

export default function HomePage() {
  const { data: session } = useSession();
  const workspaces = useWorkspaces();
  const recent = useRecent();
  const favorites = useFavorites();
  const invitations = useMyInvitations();
  const client = useQueryClient();
  const router = useRouter();
  const [accepting, setAccepting] = useState<string | null>(null);
  const firstName = session?.user.name.split(" ")[0];

  async function accept(id: string) {
    setAccepting(id);
    try {
      const result = await api<{ workspaceId: string }>(`/invitations/${id}/accept`, { method: "POST" });
      invalidateAccess(client);
      void client.invalidateQueries({ queryKey: ["my-invitations"] });
      toast.success("You joined the workspace");
      router.push(`/w/${result.workspaceId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't accept the invitation");
    } finally {
      setAccepting(null);
    }
  }

  if (workspaces.isError) {
    return (
      <Page>
        <QueryError error={workspaces.error} retry={() => void workspaces.refetch()} what="your workspaces" />
      </Page>
    );
  }

  if (workspaces.data && workspaces.data.length === 0 && (invitations.data?.length ?? 0) === 0) {
    return (
      <Page narrow>
        <PageHeader title={`Welcome${firstName ? `, ${firstName}` : ""}`} description="Create a workspace to start writing with your team." />
        <div className="rounded-lg border border-border bg-surface p-6 shadow-xs">
          <h2 className="mb-1 text-lg font-semibold">Name your first workspace</h2>
          <p className="mb-5 text-sm text-muted-foreground">Usually a team or project. You can invite people once it exists.</p>
          <CreateWorkspaceForm />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title={`Good to see you${firstName ? `, ${firstName}` : ""}`} description="Pick up where you left off." />

      {invitations.data && invitations.data.length > 0 ? (
        <Section title="Invitations">
          <ul className="space-y-2">
            {invitations.data.map((invite) => (
              <li key={invite.id} className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary-soft p-4 sm:flex-row sm:items-center">
                <MailPlus className="hidden size-5 shrink-0 text-primary sm:block" aria-hidden />
                <p className="flex-1 text-sm">
                  <strong className="font-medium">{invite.invitedByName}</strong> invited you to <strong className="font-medium">{invite.workspaceName}</strong> as {RoleBadgeLabel(invite.role).toLowerCase()}.
                </p>
                <Button variant="primary" size="sm" loading={accepting === invite.id} onClick={() => accept(invite.id)}>
                  Accept
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Recent" description="Documents you opened lately.">
        {recent.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : recent.data && recent.data.length > 0 ? (
          <DocumentList>
            {recent.data.slice(0, 6).map((doc) => (
              <DocumentRow key={doc.id} id={doc.id} title={doc.title} meta={doc.workspaceName} />
            ))}
          </DocumentList>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden /> Documents you open will show up here.
          </p>
        )}
      </Section>

      {favorites.data && favorites.data.length > 0 ? (
        <Section title="Favorites">
          <DocumentList>
            {favorites.data.map((doc) => (
              <DocumentRow key={doc.id} id={doc.id} title={doc.title} meta={doc.workspaceName} isFavorite />
            ))}
          </DocumentList>
        </Section>
      ) : (
        <p className="mb-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Star className="size-4" aria-hidden /> Star a document to pin it here.
        </p>
      )}

      <Section title="Workspaces">
        {workspaces.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {workspaces.data?.map((w) => (
              <li key={w.id}>
                <Link href={`/w/${w.id}`} className="group flex h-full items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-xs transition-[border-color,box-shadow] hover:border-foreground/25 hover:shadow-sm">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground">{w.name[0]?.toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{w.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {w.documentCount} {w.documentCount === 1 ? "document" : "documents"} · {w.memberCount} {w.memberCount === 1 ? "member" : "members"}
                    </span>
                  </span>
                  <Badge tone={w.role === "owner" ? "primary" : "neutral"}>{RoleBadgeLabel(w.role)}</Badge>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="size-4" aria-hidden /> Use the switcher in the sidebar to create another workspace.
        </p>
      </Section>
    </Page>
  );
}
