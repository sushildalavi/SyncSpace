"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/components/auth/authShell";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage, useSession } from "@/lib/authClient";
import { safeNextPath } from "@/lib/utils";

export function TwoFactorForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const { refetch } = useSession();
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = useBackup ? code.trim() : code.replace(/\s/g, "");
    if (!value) {
      setError(useBackup ? "Enter a backup code" : "Enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError(null);
    const result = useBackup ? await authClient.twoFactor.verifyBackupCode({ code: value }) : await authClient.twoFactor.verifyTotp({ code: value });
    if (result.error) {
      setBusy(false);
      setError(authErrorMessage(result.error));
      return;
    }
    await refetch();
    router.replace(next);
  }

  return (
    <AuthShell
      title="Enter your code"
      description={useBackup ? "Use one of the backup codes you saved." : "Open your authenticator app and enter the code for SyncSpace."}
      footer={
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError>{error}</FormError>
        <Field id="code" label={useBackup ? "Backup code" : "6-digit code"}>
          {(aria) => (
            <Input
              {...aria}
              key={useBackup ? "backup" : "totp"}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete={useBackup ? "off" : "one-time-code"}
              inputMode={useBackup ? "text" : "numeric"}
              autoFocus
              spellCheck={false}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Verify
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setUseBackup(!useBackup);
            setCode("");
            setError(null);
          }}
        >
          {useBackup ? "Use my authenticator app" : "Use a backup code instead"}
        </Button>
      </form>
    </AuthShell>
  );
}
