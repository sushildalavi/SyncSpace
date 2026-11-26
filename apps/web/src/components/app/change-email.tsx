"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/auth-client";

const Schema = z.object({ newEmail: z.string().trim().toLowerCase().email("Enter a valid email address") });

/** Two emails: the current address approves, then the new one is confirmed. */
export function ChangeEmail({ current }: { current: string }) {
  const [requested, setRequested] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<z.infer<typeof Schema>>({ resolver: zodResolver(Schema), defaultValues: { newEmail: "" } });

  async function submit({ newEmail }: z.infer<typeof Schema>) {
    setFormError(null);
    setRequested(null);
    if (newEmail === current.toLowerCase()) {
      setFormError("That is already your email address.");
      return;
    }
    const { error } = await authClient.changeEmail({ newEmail, callbackURL: `${window.location.origin}/settings?emailLink=1` });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    setRequested(newEmail);
    reset();
  }

  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="space-y-3">
      <FormError>{formError}</FormError>
      {requested ? (
        <FormNotice tone="success">
          Check {current} and approve the change. We&apos;ll then email {requested} to confirm it. Nothing changes until both are done.
        </FormNotice>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field id="newEmail" label="New email address" className="flex-1" error={errors.newEmail?.message}>
          {(aria) => <Input {...aria} type="email" autoComplete="email" {...register("newEmail")} />}
        </Field>
        <Button type="submit" loading={isSubmitting} className="sm:mt-[26px]">Change email</Button>
      </div>
    </form>
  );
}
