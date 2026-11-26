"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { WorkspaceUpdateSchema, roleCan } from "@syncspace/contracts";
import { QueryError } from "@/components/layout/errorState";
import { IntegrationsPanel } from "@/components/workspace/integrationsPanel";
import { Page, PageHeader, Section } from "@/components/layout/pageLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { invalidateAccess, useWorkspace } from "@/lib/queries";

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = useWorkspace(workspaceId);
  const client = useQueryClient();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canUpdate = roleCan(workspace.data?.role, "workspace.update");
  const canIntegrate = roleCan(workspace.data?.role, "integration.manage");
  const canDelete = roleCan(workspace.data?.role, "workspace.delete");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty }
  } = useForm<{ name: string }>({ resolver: zodResolver(WorkspaceUpdateSchema), defaultValues: { name: "" } });
  useEffect(() => {
    if (workspace.data) reset({ name: workspace.data.name });
  }, [workspace.data, reset]);

  if (workspace.isError) return <Page><QueryError heading="h1" error={workspace.error} what="this workspace" /></Page>;

  async function archive() {
    setDeleting(true);
    try {
      await api(`/workspaces/${workspaceId}`, { method: "DELETE" });
      invalidateAccess(client);
      toast.success("Workspace deleted");
      router.replace("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the workspace");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Page narrow>
      <PageHeader title="Workspace settings" />

      <Section title="General">
        <form
          noValidate
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={handleSubmit(async ({ name }) => {
            try {
              await api(`/workspaces/${workspaceId}`, { method: "PATCH", body: { name } });
              invalidateAccess(client, workspaceId);
              toast.success("Workspace renamed");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Couldn't rename");
            }
          })}
        >
          <Field id="ws-name" label="Name" className="flex-1" error={errors.name?.message}>
            {(aria) => <Input {...aria} disabled={!canUpdate} {...register("name")} />}
          </Field>
          {canUpdate ? (
            <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty} className="sm:mt-[26px]">
              Save
            </Button>
          ) : null}
        </form>
        {!canUpdate && workspace.data ? <p className="mt-2 text-sm text-muted-foreground">Only owners can change workspace settings.</p> : null}
      </Section>

      <Section title="Notifications" description="Post document links to a chat channel.">
        {canIntegrate ? <IntegrationsPanel workspaceId={workspaceId} /> : <p className="text-sm text-muted-foreground">Only owners can manage integrations.</p>}
      </Section>

      {canDelete ? (
        <Section title="Danger zone">
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <h3 className="font-medium">Delete this workspace</h3>
              <p className="text-sm text-muted-foreground">Members lose access immediately. Documents are archived, not erased.</p>
            </div>
            <Button variant="destructive" onClick={() => setConfirming(true)}>Delete workspace</Button>
          </div>
        </Section>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {workspace.data?.name}?</DialogTitle>
            <DialogDescription>Everyone in the workspace loses access right away, including people editing at this moment.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="destructive" loading={deleting} onClick={archive}>Delete workspace</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
