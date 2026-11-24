"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { useConfig } from "@/lib/queries";
import { GoogleButton } from "./google-button";
import { OrDivider } from "./auth-shell";

/** Renders nothing unless the API reports Google as configured. */
export function GoogleSignIn({ next, label }: { next: string; label?: string }) {
  const { data: config } = useConfig();
  const [pending, setPending] = useState(false);
  if (!config?.googleEnabled) return null;

  async function start() {
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}${next}`,
      errorCallbackURL: `${window.location.origin}/auth/error`
    });
    if (error) {
      setPending(false);
      toast.error(authErrorMessage(error));
    }
    // On success the browser is redirected to Google, so the button stays in its loading state.
  }

  return (
    <>
      <GoogleButton onClick={start} loading={pending} {...(label ? { label } : {})} />
      <OrDivider />
    </>
  );
}
