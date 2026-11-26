"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ProfileUpdateSchema } from "@syncspace/contracts";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { ChangeEmail } from "@/components/account/changeEmail";
import { DeleteAccount } from "@/components/account/deleteAccount";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormNotice } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage, useSession } from "@/lib/authClient";

export default function ProfileSettings() {
  const { data } = useSession();
  const user = data?.user;
  const [sending, setSending] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty }
  } = useForm<{ name: string }>({ resolver: zodResolver(ProfileUpdateSchema), defaultValues: { name: "" } });
  useEffect(() => {
    if (user) reset({ name: user.name });
  }, [user, reset]);
  const [fromEmailLink, setFromEmailLink] = useState(false);
  useEffect(() => setFromEmailLink(new URLSearchParams(window.location.search).has("emailLink")), []);

  if (!user) return null;

  async function resend() {
    setSending(true);
    const { error } = await authClient.sendVerificationEmail({ email: user!.email, callbackURL: `${window.location.origin}/verify-email?status=success&next=/settings` });
    setSending(false);
    if (error) toast.error(authErrorMessage(error));
    else toast.success("Confirmation email sent");
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="profile-heading" className="space-y-5">
        <h2 id="profile-heading" className="text-lg font-semibold">Profile</h2>
        <div className="flex items-center gap-4">
          <Avatar name={user.name} src={user.image ?? null} size="xl" />
          <p className="text-sm text-muted-foreground">
            {user.image ? "Your picture comes from your connected Google account." : "Your initials are used as your avatar."}
          </p>
        </div>
        <form
          noValidate
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={handleSubmit(async ({ name }) => {
            const { error } = await authClient.updateUser({ name });
            if (error) toast.error(authErrorMessage(error));
            else {
              toast.success("Profile updated");
              reset({ name });
            }
          })}
        >
          <Field id="name" label="Display name" hint="Shown to collaborators on cursors and member lists." className="flex-1" error={errors.name?.message}>
            {(aria) => <Input {...aria} autoComplete="name" {...register("name")} />}
          </Field>
          <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty} className="sm:mt-[26px]">
            Save
          </Button>
        </form>
      </section>

      <section aria-labelledby="email-heading" className="space-y-3">
        <h2 id="email-heading" className="text-lg font-semibold">Email</h2>
        {fromEmailLink ? (
          <FormNotice tone="success">Link accepted. If the address below hasn&apos;t changed yet, open the email we sent to your new address.</FormNotice>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-xs">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{user.email}</p>
            <p className="text-sm text-muted-foreground">Used to sign in and receive invitations.</p>
          </div>
          {user.emailVerified ? (
            <Badge tone="success"><BadgeCheck className="size-3.5" aria-hidden /> Verified</Badge>
          ) : (
            <>
              <Badge tone="warning"><TriangleAlert className="size-3.5" aria-hidden /> Not verified</Badge>
              <Button size="sm" onClick={resend} loading={sending}>Send confirmation</Button>
            </>
          )}
        </div>
        {user.emailVerified ? <ChangeEmail current={user.email} /> : null}
      </section>

      <DeleteAccount email={user.email} />
    </div>
  );
}
