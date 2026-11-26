"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DocumentShareSchema, type DocumentShareInput, type ShareRole } from "@syncspace/contracts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { keys, useShares, type DocumentShare } from "@/lib/queries";

/** People who can open this one document without joining the workspace. */
export function SharesPanel({ documentId }: { documentId: string }) {
  const shares = useShares(documentId, true);
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: keys.shares(documentId) });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<DocumentShareInput>({ resolver: zodResolver(DocumentShareSchema), defaultValues: { email: "", role: "viewer" } });

  async function save(email: string, role: ShareRole) {
    await api(`/documents/${documentId}/shares`, { method: "PUT", body: { email, role } });
  }

  async function add(values: DocumentShareInput) {
    try {
      await save(values.email, values.role);
      reset({ email: "", role: values.role });
      toast.success(`Shared with ${values.email}`);
    } catch (error) {
      setError("email", { message: error instanceof Error ? error.message : "Couldn't share the document" });
    } finally {
      void refresh();
    }
  }

  async function change(share: DocumentShare, role: ShareRole) {
    try {
      await save(share.email, role);
      toast.success(`${share.email} can now ${role === "editor" ? "edit" : "view"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change access");
    } finally {
      void refresh();
    }
  }

  async function remove(share: DocumentShare) {
    try {
      await api(`/documents/${documentId}/shares/${share.id}`, { method: "DELETE" });
      toast.success(`${share.email} no longer has this share`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove access");
    } finally {
      void refresh();
    }
  }

  return (
    <section aria-labelledby="shares-heading" className="space-y-3">
      <div>
        <h3 id="shares-heading" className="font-semibold">Only this document</h3>
        <p className="text-sm text-muted-foreground">They see this document, including its version history, and nothing else in the workspace. They need to confirm that email address.</p>
      </div>
      <form noValidate onSubmit={handleSubmit(add)} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Field id="share-email" label="Share with email" className="flex-1" error={errors.email?.message}>
          {(aria) => <Input {...aria} type="email" autoComplete="off" placeholder="name@company.com" {...register("email")} />}
        </Field>
        <Field id="share-role" label="Can">
          {(aria) => (
            <Select {...aria} className="sm:w-28" {...register("role")}>
              <option value="viewer">View</option>
              <option value="editor">Edit</option>
            </Select>
          )}
        </Field>
        <Button type="submit" variant="primary" loading={isSubmitting} className="sm:mt-[26px]">Share</Button>
      </form>
      {shares.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : shares.isError ? (
        <p role="alert" className="text-sm text-destructive">{shares.error.message}</p>
      ) : shares.data && shares.data.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-border">
          {shares.data.map((share) => (
            <li key={share.id} className="flex items-center gap-2 border-b border-border p-3 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-sm">{share.email}</span>
              <Select aria-label={`Access for ${share.email}`} className="h-8 w-28 shrink-0" value={share.role} onChange={(event) => void change(share, event.target.value as ShareRole)}>
                <option value="viewer">View</option>
                <option value="editor">Edit</option>
              </Select>
              <Button variant="ghost" size="icon-sm" aria-label={`Stop sharing with ${share.email}`} onClick={() => void remove(share)}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
