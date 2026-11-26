"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/passwordInput";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

type Preview = {
  requiresPassword: boolean;
  workspacesToDelete: Array<{ id: string; name: string; documentCount: number }>;
  blockers: Array<{ id: string; name: string }>;
};

export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useQuery({ queryKey: ["deletion-preview"], queryFn: () => api<Preview>("/me/deletion"), enabled: open, staleTime: 0 });
  const blocked = (preview.data?.blockers.length ?? 0) > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/me", { method: "DELETE", body: { confirmEmail, ...(password ? { password } : {}) } });
      // A full load drops every cached byte of the old account.
      window.location.assign("/sign-in?deleted=1");
    } catch (failure) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : "Couldn't delete the account");
    }
  }

  return (
    <section aria-labelledby="delete-heading" className="space-y-3">
      <h2 id="delete-heading" className="text-lg font-semibold">Delete account</h2>
      <p className="text-sm text-muted-foreground">Permanently removes your account and sign-in details. This can&apos;t be undone.</p>
      <Button
        variant="destructive"
        onClick={() => {
          setConfirmEmail("");
          setPassword("");
          setError(null);
          setOpen(true);
        }}
      >
        Delete my account
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Text you wrote in other people&apos;s workspaces stays, credited to &quot;Deleted user&quot;.
            </DialogDescription>
          </DialogHeader>
          {preview.isError ? (
            <FormError>{preview.error.message}</FormError>
          ) : !preview.data ? (
            // the query is idle until the dialog opens, so "no data yet" is the loading state
            <Skeleton className="h-24 w-full" />
          ) : blocked ? (
            <div className="space-y-2 text-sm">
              <p>You are the only owner of these workspaces. Make someone else an owner, or remove the other members, then try again.</p>
              <ul className="list-disc pl-5">
                {preview.data.blockers.map((item) => (
                  <li key={item.id}>
                    <Link className="font-medium text-primary hover:underline" href={`/w/${item.id}/members`}>{item.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <form noValidate onSubmit={submit} className="space-y-4">
              {preview.data.workspacesToDelete.length > 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive">
                  <p className="font-medium">These workspaces and their documents will be deleted, including for anyone they were shared with:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {preview.data.workspacesToDelete.map((item) => (
                      <li key={item.id}>
                        {item.name} ({item.documentCount} {item.documentCount === 1 ? "document" : "documents"})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <FormError>{error}</FormError>
              <Field id="confirm-email" label={`Type ${email} to confirm`}>
                {(aria) => <Input {...aria} type="email" autoComplete="off" value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} />}
              </Field>
              {preview.data.requiresPassword ? (
                <Field id="delete-password" label="Your password">
                  {(aria) => <PasswordInput {...aria} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />}
                </Field>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  variant="destructive"
                  loading={busy}
                  disabled={confirmEmail.trim().toLowerCase() !== email.toLowerCase() || (preview.data.requiresPassword && !password)}
                >
                  Delete account
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
