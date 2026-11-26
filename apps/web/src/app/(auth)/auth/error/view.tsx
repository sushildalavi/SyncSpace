"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/authShell";
import { Button } from "@/components/ui/button";

type Explanation = { title: string; body: string; primary: { href: string; label: string }; secondary?: { href: string; label: string } };

/** Maps Better Auth's OAuth error codes to what happened and what to do next. */
function explain(code: string | null): Explanation {
  switch (code?.toLowerCase()) {
    case "access_denied":
    case "user_cancelled_authorize":
    case "oauth_provider_error":
      return {
        title: "Google sign-in was cancelled",
        body: "You closed the Google window or declined access, so nothing changed. You can try again whenever you like.",
        primary: { href: "/sign-in", label: "Back to sign in" }
      };
    case "account_not_linked":
      return {
        title: "An account with this email already exists",
        body: "For your security we don't merge accounts automatically. Sign in with your email and password, then connect Google from Settings → Connections.",
        primary: { href: "/sign-in", label: "Sign in with email" },
        secondary: { href: "/forgot-password", label: "Forgot your password?" }
      };
    case "state_mismatch":
    case "invalid_state":
    case "state_not_found":
    case "please_restart_the_process":
      return {
        title: "That sign-in attempt expired",
        body: "The sign-in request timed out or was opened in a different browser. Start again from the sign-in page.",
        primary: { href: "/sign-in", label: "Try again" }
      };
    case "email_not_found":
    case "email_doesn't_match":
    case "unable_to_link_account":
      return {
        title: "We couldn't connect that Google account",
        body: "Google didn't return a verified email address we could use, or the account couldn't be linked. Try a different Google account.",
        primary: { href: "/settings/connections", label: "Back to settings" }
      };
    case "account_already_linked_to_different_user":
      return {
        title: "That Google account belongs to someone else",
        body: "It's already connected to a different SyncSpace account. Disconnect it there first, or use another Google account.",
        primary: { href: "/settings/connections", label: "Back to settings" }
      };
    default:
      return {
        title: "Something went wrong signing you in",
        body: "We couldn't complete the sign-in. Try again, and if it keeps happening, use your email and password instead.",
        primary: { href: "/sign-in", label: "Back to sign in" }
      };
  }
}

export function AuthErrorView() {
  const params = useSearchParams();
  const info = explain(params.get("error"));
  return (
    <AuthShell title={info.title} description={info.body}>
      <div className="space-y-4">
        <div className="flex size-11 items-center justify-center rounded-lg bg-warning-soft text-warning">
          <TriangleAlert className="size-5" aria-hidden />
        </div>
        <Button asChild variant="primary" size="lg" className="w-full">
          <Link href={info.primary.href}>{info.primary.label}</Link>
        </Button>
        {info.secondary ? (
          <Button asChild variant="ghost" size="lg" className="w-full">
            <Link href={info.secondary.href}>{info.secondary.label}</Link>
          </Button>
        ) : null}
        {params.get("error") ? <p className="text-center text-xs text-muted-foreground">Error code: {params.get("error")}</p> : null}
      </div>
    </AuthShell>
  );
}
