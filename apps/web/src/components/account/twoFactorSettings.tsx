"use client";

import { useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/passwordInput";
import { authClient, authErrorMessage, useSession } from "@/lib/authClient";

type Step =
  | { name: "idle" }
  | { name: "password"; action: "enable" | "disable" | "codes" }
  | { name: "scan"; qr: string; secret: string; backupCodes: string[] }
  | { name: "codes"; backupCodes: string[] };

const actionLabels = { enable: "Continue", disable: "Turn off", codes: "Create new codes" } as const;

/** Authenticator-app setup. Nothing is switched on until a first code proves the app is configured. */
export function TwoFactorSettings({ hasPassword }: { hasPassword: boolean }) {
  const { data, refetch } = useSession();
  const client = useQueryClient();
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const enabled = Boolean(data?.user.twoFactorEnabled);
  const verified = Boolean(data?.user.emailVerified);

  function go(next: Step) {
    setStep(next);
    setPassword("");
    setCode("");
    setError(null);
  }

  async function refreshAccount() {
    await refetch();
    void client.invalidateQueries({ queryKey: ["sessions"] });
    void client.invalidateQueries({ queryKey: ["security-events"] });
  }

  async function submitPassword(event: FormEvent, action: "enable" | "disable" | "codes") {
    event.preventDefault();
    if (!password) return setError("Enter your password");
    setBusy(true);
    setError(null);
    if (action === "enable") {
      const result = await authClient.twoFactor.enable({ password });
      setBusy(false);
      if (result.error) return setError(authErrorMessage(result.error));
      const setup = result.data as { totpURI: string; backupCodes: string[] };
      const qr = await QRCode.toDataURL(setup.totpURI, { margin: 2, width: 200 });
      go({ name: "scan", qr, secret: new URL(setup.totpURI).searchParams.get("secret") ?? "", backupCodes: setup.backupCodes });
    } else if (action === "disable") {
      const result = await authClient.twoFactor.disable({ password });
      setBusy(false);
      if (result.error) return setError(authErrorMessage(result.error));
      go({ name: "idle" });
      toast.success("Two-factor sign-in is off");
      await refreshAccount();
    } else {
      const result = await authClient.twoFactor.generateBackupCodes({ password });
      setBusy(false);
      if (result.error) return setError(authErrorMessage(result.error));
      go({ name: "codes", backupCodes: result.data.backupCodes });
    }
  }

  async function confirmCode(event: FormEvent, backupCodes: string[]) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setBusy(false);
    if (result.error) return setError(authErrorMessage(result.error));
    go({ name: "codes", backupCodes });
    toast.success("Two-factor sign-in is on");
    await refreshAccount();
  }

  return (
    <section aria-labelledby="two-factor-heading" className="space-y-4">
      <div>
        <h2 id="two-factor-heading" className="flex items-center gap-2 text-lg font-semibold">
          Two-factor sign-in <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "On" : "Off"}</Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          After your password, you also enter a code from an authenticator app. Signing in with Google uses your Google account&apos;s own protection instead.
        </p>
      </div>

      {!hasPassword ? (
        <p className="text-sm text-muted-foreground">Add a password above to use two-factor sign-in.</p>
      ) : !verified ? (
        <p className="text-sm text-muted-foreground">Confirm your email address first. You can send the link from the Profile tab.</p>
      ) : step.name === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <Button size="sm" onClick={() => go({ name: "password", action: "codes" })}>New backup codes</Button>
              <Button size="sm" variant="ghost" onClick={() => go({ name: "password", action: "disable" })}>Turn off</Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => go({ name: "password", action: "enable" })}>Set up two-factor sign-in</Button>
          )}
        </div>
      ) : step.name === "password" ? (
        <form noValidate onSubmit={(event) => submitPassword(event, step.action)} className="max-w-sm space-y-4">
          <FormError>{error}</FormError>
          <Field id="two-factor-password" label="Enter your password to continue">
            {(aria) => <PasswordInput {...aria} autoComplete="current-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} />}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant={step.action === "disable" ? "destructive" : "primary"} loading={busy}>{actionLabels[step.action]}</Button>
            <Button type="button" variant="ghost" onClick={() => go({ name: "idle" })}>Cancel</Button>
          </div>
        </form>
      ) : step.name === "scan" ? (
        <div className="max-w-md space-y-4">
          <p className="text-sm">1. Scan this with your authenticator app, or type the key in by hand.</p>
          {/* A data URL generated on this device; the secret is never sent to an image service. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step.qr} width={200} height={200} alt="QR code for your authenticator app" className="rounded-lg border border-border bg-white" />
          <p className="text-sm text-muted-foreground">
            Setup key: <code data-testid="totp-secret" className="break-all font-mono text-foreground">{step.secret}</code>
          </p>
          <form noValidate onSubmit={(event) => confirmCode(event, step.backupCodes)} className="space-y-4">
            <FormError>{error}</FormError>
            <Field id="two-factor-code" label="2. Enter the 6-digit code it shows">
              {(aria) => <Input {...aria} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={busy}>Turn on</Button>
              <Button type="button" variant="ghost" onClick={() => go({ name: "idle" })}>Cancel</Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="max-w-md space-y-3 rounded-lg border border-warning/30 bg-warning-soft p-4">
          <p className="text-sm font-medium text-warning">Save these backup codes now. They are not shown again, and each works once.</p>
          <ul aria-label="Backup codes" className="grid grid-cols-2 gap-1 font-mono text-sm">
            {step.backupCodes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(step.backupCodes.join("\n"));
                toast.success("Backup codes copied");
              }}
            >
              Copy
            </Button>
            <Button size="sm" variant="primary" onClick={() => go({ name: "idle" })}>I&apos;ve saved them</Button>
          </div>
        </div>
      )}
    </section>
  );
}
