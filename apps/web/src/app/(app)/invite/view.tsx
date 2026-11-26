"use client";

import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { QueryError } from "@/components/layout/errorState";
import { Page, RoleBadgeLabel } from "@/components/layout/pageLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { invalidateAccess } from "@/lib/queries";

type Preview = { workspaceName: string; role: "owner" | "editor" | "viewer"; forEmail: string; matchesAccount: boolean };

export function InviteView() {
  usePageTitle("Invitation");
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const preview = useQuery({ queryKey: ["invite-preview", token], queryFn: () => api<Preview>("/invitations/preview", { method: "POST", body: { token } }), enabled: token.length > 0, retry: false });

  async function accept() {
    setPending(true);
    try {
      const result = await api<{ workspaceId: string }>("/invitations/accept", { method: "POST", body: { token } });
      invalidateAccess(client);
      toast.success("You joined the workspace");
      router.replace(`/w/${result.workspaceId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't accept the invitation");
      setPending(false);
    }
  }

  return (
    <Page narrow>
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        {!token ? (
          <QueryError heading="h1" error={new Error("This invitation link is incomplete.")} />
        ) : preview.isLoading ? (
          <Skeleton className="mx-auto h-24 w-full" />
        ) : preview.isError ? (
          <>
            <h1 className="text-xl font-semibold">This invitation is no longer valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">It may have expired, been revoked, or already been used. Ask the workspace owner to send a new one.</p>
            <Button asChild className="mt-6"><Link href="/">Go home</Link></Button>
          </>
        ) : preview.data ? (
          <>
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary"><MailPlus className="size-6" aria-hidden /></div>
            <h1 className="text-xl font-semibold">Join {preview.data.workspaceName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">You&apos;ve been invited as {preview.data.role === "viewer" ? "a" : "an"} <strong className="font-medium text-foreground">{RoleBadgeLabel(preview.data.role)}</strong>.</p>
            {preview.data.matchesAccount ? (
              <Button variant="primary" size="lg" className="mt-6 w-full" onClick={accept} loading={pending}>Accept invitation</Button>
            ) : (
              <p role="alert" className="mt-6 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
                This invitation was sent to <strong>{preview.data.forEmail}</strong>, but you&apos;re signed in with a different address. Sign in with that account to accept.
              </p>
            )}
          </>
        ) : null}
      </div>
    </Page>
  );
}
