"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/authShell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage, useSession } from "@/lib/authClient";
import { safeNextPath } from "@/lib/utils";

/** Landing page for the confirmation link, and the place to request another one. */
export function VerifyEmail() {
  const params = useSearchParams();
  const { data: session } = useSession();
  const next = safeNextPath(params.get("next"));
  const error = params.get("error");
  const success = params.get("status") === "success" && !error;
  const [email, setEmail] = useState(params.get("email") ?? session?.user.email ?? "");
  const [emailError, setEmailError] = useState<string>();
  const [sending, setSending] = useState(false);

  async function resend() {
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError(undefined);
    setSending(true);
    const { error: sendError } = await authClient.sendVerificationEmail({
      email: parsed.data,
      callbackURL: `${window.location.origin}/verify-email?status=success&next=${encodeURIComponent(next)}`
    });
    setSending(false);
    if (sendError) toast.error(authErrorMessage(sendError));
    else toast.success("If that account needs confirming, a new link is on its way.");
  }

  if (success) {
    return (
      <AuthShell title="Email confirmed" description="Your address is verified. You're all set.">
        <div className="space-y-5">
          <div className="flex size-11 items-center justify-center rounded-lg bg-success-soft text-success">
            <CircleCheck className="size-5" aria-hidden />
          </div>
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href={session ? next : "/sign-in?verified=1"}>{session ? "Continue to SyncSpace" : "Sign in"}</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={error ? "That link didn't work" : "Confirm your email"}
      description={error ? "Confirmation links expire after an hour and only work once. Request a fresh one below." : "Enter your address and we'll send a new confirmation link."}
      footer={
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-4">
        {error ? (
          <div className="flex size-11 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <TriangleAlert className="size-5" aria-hidden />
          </div>
        ) : null}
        <Field id="email" label="Email" error={emailError}>
          {(aria) => <Input {...aria} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />}
        </Field>
        <Button variant="primary" size="lg" className="w-full" onClick={resend} loading={sending}>
          Send confirmation link
        </Button>
      </div>
    </AuthShell>
  );
}
