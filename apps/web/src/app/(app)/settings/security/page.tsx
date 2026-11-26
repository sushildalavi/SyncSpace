"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { TwoFactorSettings } from "@/components/app/two-factor-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { authClient, authErrorMessage, useSession } from "@/lib/auth-client";
import type { SecurityEvent } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";

const Schema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters"),
    confirm: z.string()
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "The passwords don't match" })
  .refine((v) => v.next !== v.current, { path: ["next"], message: "Choose a password you haven't used here" });

function describeAgent(agent: string | null | undefined): { label: string; mobile: boolean } {
  if (!agent) return { label: "Unknown device", mobile: false };
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : /curl/i.test(agent) ? "curl" : "Browser";
  const os = /Windows/.test(agent) ? "Windows" : /Android/.test(agent) ? "Android" : /iPhone|iPad|iOS/.test(agent) ? "iOS" : /Mac OS X|Macintosh/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "";
  return { label: os ? `${browser} on ${os}` : browser, mobile: /Android|iPhone|iPad/.test(agent) };
}

const eventLabels: Record<string, string> = {
  "auth.signed_in": "Signed in",
  "auth.session_ended": "Session ended",
  "auth.password_reset": "Password reset",
  "auth.provider_linked": "Provider connected",
  "auth.provider_unlinked": "Provider disconnected",
  "auth.two_factor_challenged": "Password accepted, waiting for a code",
  "auth.two_factor_enabled": "Two-factor sign-in turned on",
  "auth.two_factor_disabled": "Two-factor sign-in turned off",
  "auth.email_changed": "Email address changed",
  "account.delete_denied": "Account deletion refused",
  "document.shared": "Shared a document",
  "document.unshared": "Removed a share",
  "document.restored": "Restored a document version",
  "workspace.created": "Created a workspace",
  "member.role_changed": "Changed a member's role",
  "member.removed": "Removed a member",
  "invitation.created": "Sent an invitation",
  "invitation.accepted": "Accepted an invitation"
};

export default function SecuritySettings() {
  const { data: current } = useSession();
  const client = useQueryClient();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: async () => (await authClient.listAccounts()).data ?? [] });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(authErrorMessage(error));
      return data ?? [];
    }
  });
  const events = useQuery({ queryKey: ["security-events"], queryFn: () => api<SecurityEvent[]>("/me/security-events?limit=12") });
  const hasPassword = accounts.data?.some((account) => account.providerId === "credential");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<z.infer<typeof Schema>>({ resolver: zodResolver(Schema), defaultValues: { current: "", next: "", confirm: "" } });

  async function changePassword(values: z.infer<typeof Schema>) {
    setFormError(null);
    const { error } = await authClient.changePassword({ currentPassword: values.current, newPassword: values.next, revokeOtherSessions: true });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    reset();
    toast.success("Password changed. Other devices were signed out.");
    void client.invalidateQueries({ queryKey: ["sessions"] });
  }

  async function revoke(token: string, id: string) {
    setRevoking(id);
    const { error } = await authClient.revokeSession({ token });
    setRevoking(null);
    if (error) toast.error(authErrorMessage(error));
    else toast.success("Device signed out");
    void client.invalidateQueries({ queryKey: ["sessions"] });
  }

  async function revokeOthers() {
    setRevoking("others");
    const { error } = await authClient.revokeOtherSessions();
    setRevoking(null);
    if (error) toast.error(authErrorMessage(error));
    else toast.success("Signed out of all other devices");
    void client.invalidateQueries({ queryKey: ["sessions"] });
  }

  async function revokeAll() {
    setRevoking("all");
    await authClient.revokeSessions();
    client.clear();
    router.replace("/sign-in");
  }

  return (
    <div className="space-y-12">
      <section aria-labelledby="password-heading" className="space-y-4">
        <h2 id="password-heading" className="text-lg font-semibold">Password</h2>
        {accounts.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : hasPassword ? (
          <form noValidate onSubmit={handleSubmit(changePassword)} className="max-w-sm space-y-4">
            <FormError>{formError}</FormError>
            <Field id="current" label="Current password" error={errors.current?.message}>
              {(aria) => <PasswordInput {...aria} autoComplete="current-password" {...register("current")} />}
            </Field>
            <Field id="next" label="New password" hint="At least 10 characters." error={errors.next?.message}>
              {(aria) => <PasswordInput {...aria} autoComplete="new-password" {...register("next")} />}
            </Field>
            <Field id="confirm" label="Confirm new password" error={errors.confirm?.message}>
              {(aria) => <PasswordInput {...aria} autoComplete="new-password" {...register("confirm")} />}
            </Field>
            <Button type="submit" variant="primary" loading={isSubmitting}>Change password</Button>
          </form>
        ) : (
          <div className="max-w-md rounded-lg border border-border bg-muted/50 p-4 text-sm">
            <p>You sign in with Google and haven&apos;t set a password. To add one, we&apos;ll email you a secure link.</p>
            <Button
              className="mt-3"
              onClick={async () => {
                const { error } = await authClient.requestPasswordReset({ email: current!.user.email, redirectTo: `${window.location.origin}/reset-password` });
                if (error) toast.error(authErrorMessage(error));
                else toast.success("Check your email for the link");
              }}
            >
              Email me a link
            </Button>
          </div>
        )}
      </section>

      {accounts.isLoading ? null : <TwoFactorSettings hasPassword={Boolean(hasPassword)} />}

      <section aria-labelledby="sessions-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="sessions-heading" className="text-lg font-semibold">Active sessions</h2>
            <p className="text-sm text-muted-foreground">Devices currently signed in to your account. Signing one out also closes any documents it has open.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={revokeOthers} loading={revoking === "others"} disabled={(sessions.data?.length ?? 0) < 2}>Sign out other devices</Button>
            <Button size="sm" variant="ghost" onClick={revokeAll} loading={revoking === "all"}>Sign out everywhere</Button>
          </div>
        </div>
        {sessions.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : sessions.isError ? (
          <p role="alert" className="text-sm text-destructive">{sessions.error.message}</p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
            {sessions.data?.map((item) => {
              const device = describeAgent(item.userAgent);
              const isCurrent = item.id === current?.session.id;
              const Icon = device.mobile ? Smartphone : Laptop;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-3 border-b border-border p-4 last:border-b-0">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden /></span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex items-center gap-2 text-sm font-medium">{device.label} {isCurrent ? <Badge tone="primary">This device</Badge> : null}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.ipAddress ? `${item.ipAddress} · ` : ""}signed in {timeAgo(item.createdAt)} · expires {timeAgo(item.expiresAt)}
                    </p>
                  </div>
                  {isCurrent ? null : (
                    <Button size="sm" onClick={() => void revoke(item.token, item.id)} loading={revoking === item.id}>Sign out</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="activity-heading" className="space-y-4">
        <h2 id="activity-heading" className="text-lg font-semibold">Recent security activity</h2>
        {events.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : events.data && events.data.length > 0 ? (
          <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
            {events.data.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0">
                <span>{eventLabels[event.type] ?? event.type}{typeof event.metadata.provider === "string" ? ` (${event.metadata.provider})` : ""}</span>
                <span className="text-muted-foreground">{timeAgo(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        )}
      </section>
    </div>
  );
}
