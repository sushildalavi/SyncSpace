"use client";

import { FilePlus2, Search } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { roleCan } from "@syncspace/contracts";
import { toast } from "sonner";
import { DocumentList, DocumentRow } from "@/components/app/document-row";
import { QueryError } from "@/components/app/error-state";
import { Page, PageHeader, RoleBadgeLabel } from "@/components/app/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateDocument, useDocuments, useWorkspace } from "@/lib/queries";

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const workspace = useWorkspace(workspaceId);
  const documents = useDocuments(workspaceId);
  const create = useCreateDocument(workspaceId);
  const [filter, setFilter] = useState("");
  const canCreate = roleCan(workspace.data?.role, "document.create");

  async function newDocument() {
    try {
      const doc = await create.mutateAsync("Untitled");
      router.push(`/d/${doc.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the document");
    }
  }

  if (workspace.isError) return <Page><QueryError error={workspace.error} what="this workspace" /></Page>;

  const visible = documents.data?.filter((doc) => doc.title.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];

  return (
    <Page>
      <PageHeader
        title={workspace.data?.name ?? <Skeleton className="inline-block h-7 w-48 align-middle" />}
        eyebrow={workspace.data ? <Badge tone={workspace.data.role === "owner" ? "primary" : "neutral"}>{RoleBadgeLabel(workspace.data.role)}</Badge> : null}
        description={workspace.data && !canCreate ? "You have view-only access in this workspace." : undefined}
        actions={
          canCreate ? (
            <Button variant="primary" onClick={newDocument} loading={create.isPending}>
              <FilePlus2 aria-hidden /> New document
            </Button>
          ) : null
        }
      />

      {documents.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading documents">
          {[0, 1, 2].map((key) => <Skeleton key={key} className="h-12 w-full" />)}
        </div>
      ) : documents.isError ? (
        <QueryError error={documents.error} retry={() => void documents.refetch()} what="the documents" />
      ) : documents.data && documents.data.length === 0 ? (
        <EmptyState
          icon={FilePlus2}
          title="No documents yet"
          description={canCreate ? "Create the first one and invite your team to write alongside you." : "Documents added by editors will appear here."}
          action={canCreate ? <Button variant="primary" onClick={newDocument} loading={create.isPending}>New document</Button> : null}
        />
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Filter documents" className="pl-9" placeholder="Filter documents" value={filter} onChange={(event) => setFilter(event.target.value)} />
          </div>
          {visible.length === 0 ? (
            <EmptyState icon={Search} title="No matches" description={`Nothing in this workspace is titled "${filter}".`} action={<Button onClick={() => setFilter("")}>Clear filter</Button>} />
          ) : (
            <DocumentList>
              {visible.map((doc) => (
                <DocumentRow key={doc.id} id={doc.id} title={doc.title} updatedAt={doc.updatedAt} isFavorite={doc.isFavorite} />
              ))}
            </DocumentList>
          )}
        </>
      )}
    </Page>
  );
}
