"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "@/components/auth/authShell";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/passwordInput";
import { authClient, authErrorMessage } from "@/lib/authClient";

const Schema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters"),
    confirm: z.string()
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match" });

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const linkInvalid = !token || params.get("error") === "INVALID_TOKEN";
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<z.infer<typeof Schema>>({ resolver: zodResolver(Schema), defaultValues: { password: "", confirm: "" } });

  async function onSubmit({ password }: z.infer<typeof Schema>) {
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    router.replace("/sign-in?reset=1");
  }

  if (linkInvalid) {
    return (
      <AuthShell title="This link has expired" description="Reset links work once and expire after an hour.">
        <Button asChild variant="primary" size="lg" className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" description="You'll be signed out of all other devices.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError>{formError}</FormError>
        <Field id="password" label="New password" hint="At least 10 characters." error={errors.password?.message}>
          {(aria) => <PasswordInput {...aria} autoComplete="new-password" autoFocus {...register("password")} />}
        </Field>
        <Field id="confirm" label="Confirm new password" error={errors.confirm?.message}>
          {(aria) => <PasswordInput {...aria} autoComplete="new-password" {...register("confirm")} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
