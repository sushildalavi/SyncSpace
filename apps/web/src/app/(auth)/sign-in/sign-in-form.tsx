"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient, authErrorMessage, useSession } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/utils";

const Schema = z.object({
  email: z.string().trim().min(1, "Enter your email address").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  rememberMe: z.boolean()
});
type Values = z.infer<typeof Schema>;

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [formError, setFormError] = useState<string | null>(null);
  const { refetch } = useSession();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<Values>({ resolver: zodResolver(Schema), defaultValues: { email: params.get("email") ?? "", password: "", rememberMe: true } });

  const notice = params.get("reset") ? "Your password was updated. Sign in with the new one." : params.get("verified") ? "Email confirmed. You can sign in now." : null;

  async function onSubmit(values: Values) {
    setFormError(null);
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      rememberMe: values.rememberMe
    });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    await refetch(); // make sure the client's session state is fresh before entering protected pages
    router.replace(next);
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to pick up where you left off."
      footer={
        <>
          New to SyncSpace?{" "}
          <Link href={`/sign-up${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
        <GoogleSignIn next={next} />
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormError>{formError}</FormError>
          <Field id="email" label="Email" error={errors.email?.message}>
            {(aria) => <Input {...aria} type="email" autoComplete="email" inputMode="email" autoFocus placeholder="you@company.com" {...register("email")} />}
          </Field>
          <Field
            id="password"
            label="Password"
            error={errors.password?.message}
            labelAction={
              <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                Forgot password?
              </Link>
            }
          >
            {(aria) => <PasswordInput {...aria} autoComplete="current-password" {...register("password")} />}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 rounded border-input accent-[hsl(var(--primary))]" {...register("rememberMe")} />
            Keep me signed in for 7 days
          </label>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
