"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Link2Off } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GoogleButton } from "@/components/auth/google-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { useConfig } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";

export default function ConnectionsSettings() {
  const params = useSearchParams();
  const client = useQueryClient();
  const { data: config } = useConfig();
  const [pending, setPending] = useState<"link" | "unlink" | null>(null);
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error(authErrorMessage(error));
      return data ?? [];
    }
  });

  useEffect(() => {
    if (params.get("linked")) toast.success("Google connected");
  }, [params]);

  const google = accounts.data?.find((account) => account.providerId === "google");
  const credential = accounts.data?.find((account) => account.providerId === "credential");

  async function link() {
    setPending("link");
    const { error } = await authClient.linkSocial({
      provider: "google",
      callbackURL: `${window.location.origin}/settings/connections?linked=google`,
      errorCallbackURL: `${window.location.origin}/auth/error`
    });
    if (error) {
      setPending(null);
      toast.error(authErrorMessage(error));
    }
  }

  async function unlink() {
    setPending("unlink");
    const { error } = await authClient.unlinkAccount({ accountId: google!.id });
    setPending(null);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    await client.invalidateQueries({ queryKey: ["accounts"] });
    toast.success("Google disconnected");
  }

  return (
    <section aria-labelledby="connections-heading" className="space-y-4">
      <div>
        <h2 id="connections-heading" className="text-lg font-semibold">Sign-in methods</h2>
        <p className="text-sm text-muted-foreground">Connecting Google never gives SyncSpace access to your mail, files or calendar. It only confirms who you are.</p>
      </div>

      {accounts.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : accounts.isError ? (
        <p role="alert" className="text-sm text-destructive">{accounts.error.message}</p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
          <li className="flex items-center gap-4 border-b border-border p-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"><KeyRound className="size-5" aria-hidden /></span>
            <div className="flex-1">
              <p className="font-medium">Email &amp; password</p>
              <p className="text-sm text-muted-foreground">{credential ? "A password is set for this account." : "No password yet. Use “Forgot password” on the sign-in page to create one."}</p>
            </div>
            <Badge tone={credential ? "success" : "neutral"}>{credential ? "Active" : "Not set"}</Badge>
          </li>
          <li className="flex flex-wrap items-center gap-4 p-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-medium">Google</p>
              <p className="text-sm text-muted-foreground">{google ? `Connected ${timeAgo(google.createdAt)}.` : config?.googleEnabled ? "Not connected." : "Google sign-in isn't configured on this server."}</p>
            </div>
            {google ? (
              <Button onClick={unlink} loading={pending === "unlink"}>
                <Link2Off aria-hidden /> Disconnect
              </Button>
            ) : config?.googleEnabled ? (
              <GoogleButton label="Connect Google" className="w-auto" onClick={link} loading={pending === "link"} size="md" />
            ) : null}
          </li>
        </ul>
      )}
    </section>
  );
}
