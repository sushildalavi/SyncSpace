"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "@/components/auth/authShell";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/authClient";

const Schema = z.object({ email: z.string().trim().min(1, "Enter your email address").email("Enter a valid email address") });

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<z.infer<typeof Schema>>({ resolver: zodResolver(Schema), defaultValues: { email: "" } });

  async function onSubmit({ email }: z.infer<typeof Schema>) {
    setFormError(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` });
    if (error && error.status !== 400) {
      setFormError(authErrorMessage(error));
      return;
    }
    setSentTo(email);
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we'll send you a link to choose a new password."
      footer={
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sentTo ? (
        <div role="status" className="flex flex-col items-start gap-4">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <MailCheck className="size-5" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">
            If an account exists for <strong className="font-medium text-foreground">{sentTo}</strong>, a reset link is on its way. It expires in one hour.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormError>{formError}</FormError>
          <Field id="email" label="Email" error={errors.email?.message}>
            {(aria) => <Input {...aria} type="email" autoComplete="email" inputMode="email" autoFocus placeholder="you@company.com" {...register("email")} />}
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
