"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient, authErrorMessage, useSession } from "@/lib/auth-client";
import { useConfig } from "@/lib/queries";
import { safeNextPath } from "@/lib/utils";

const Schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80, "Keep your name under 80 characters"),
  email: z.string().trim().min(1, "Enter your email address").email("Enter a valid email address"),
  password: z.string().min(10, "Use at least 10 characters").max(128, "Use at most 128 characters")
});
type Values = z.infer<typeof Schema>;

export function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const { data: config } = useConfig();
  const { refetch } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<Values>({ resolver: zodResolver(Schema), defaultValues: { name: "", email: "", password: "" } });

  async function onSubmit(values: Values) {
    setFormError(null);
    const { data, error } = await authClient.signUp.email({ ...values, callbackURL: `${window.location.origin}/verify-email?status=success&next=${encodeURIComponent(next)}` });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    // No token means the server didn't open a session: the address has to be confirmed first.
    if (!data?.token || config?.requireEmailVerification) {
      setSentTo(values.email);
      return;
    }
    await refetch();
    router.replace(next);
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email" description={<>We sent a confirmation link to <strong className="font-medium text-foreground">{sentTo}</strong>.</>}>
        <div className="flex flex-col items-start gap-5">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <MailCheck className="size-5" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">Open the link to activate your account. It can take a minute to arrive. Check your spam folder if it doesn&apos;t.</p>
          <Button asChild variant="secondary">
            <Link href={`/verify-email?email=${encodeURIComponent(sentTo)}`}>Didn&apos;t get it?</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      description="Start collaborating in under a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/sign-in${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleSignIn next={next} label="Sign up with Google" />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError>{formError}</FormError>
        <Field id="name" label="Full name" error={errors.name?.message}>
          {(aria) => <Input {...aria} autoComplete="name" autoFocus placeholder="Ada Lovelace" {...register("name")} />}
        </Field>
        <Field id="email" label="Email" error={errors.email?.message}>
          {(aria) => <Input {...aria} type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" {...register("email")} />}
        </Field>
        <Field id="password" label="Password" hint="At least 10 characters." error={errors.password?.message}>
          {(aria) => <PasswordInput {...aria} autoComplete="new-password" {...register("password")} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
