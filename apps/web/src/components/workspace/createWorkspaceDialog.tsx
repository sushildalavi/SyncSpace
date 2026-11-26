"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { WorkspaceCreateSchema, type WorkspaceCreateInput } from "@syncspace/contracts";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCreateWorkspace } from "@/lib/queries";

export function CreateWorkspaceForm({ onDone, autoFocus = true }: { onDone?: () => void; autoFocus?: boolean }) {
  const router = useRouter();
  const create = useCreateWorkspace();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<WorkspaceCreateInput>({ resolver: zodResolver(WorkspaceCreateSchema), defaultValues: { name: "" } });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={handleSubmit(async ({ name }) => {
        try {
          const workspace = await create.mutateAsync(name);
          onDone?.();
          router.push(`/w/${workspace.id}`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Couldn't create the workspace");
        }
      })}
    >
      <Field id="workspace-name" label="Workspace name" error={errors.name?.message}>
        {(aria) => <Input {...aria} autoFocus={autoFocus} placeholder="Acme Product Team" {...register("name")} />}
      </Field>
      <Button type="submit" variant="primary" loading={create.isPending} className="w-full sm:w-auto">
        Create workspace
      </Button>
    </form>
  );
}

export function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>A workspace holds documents and the people who work on them. You&apos;ll be its first owner.</DialogDescription>
        </DialogHeader>
        <CreateWorkspaceForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
