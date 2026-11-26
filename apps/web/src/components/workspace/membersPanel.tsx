"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, LogOut, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { MemberInviteSchema, roleCan, type MemberInviteInput, type WorkspaceRole } from "@syncspace/contracts";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useSession } from "@/lib/authClient";
import { invalidateAccess, useInvitations, useMembers, useWorkspace, type Member } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";
import { roleLabel } from "../layout/pageLayout";

const roleHelp: Record<WorkspaceRole, string> = {
  owner: "Full control, including members and settings",
  editor: "Create and edit documents",
  viewer: "Read documents only"
};

/** Invite form, member list and pending invitations. Controls mirror the permissions the API enforces. */
export function MembersPanel({ workspaceId }: { workspaceId: string }) {
  const { data: session } = useSession();
  const workspace = useWorkspace(workspaceId);
  const members = useMembers(workspaceId);
  const canManage = roleCan(workspace.data?.role, "member.manage");
  const invitations = useInvitations(workspaceId, canManage);
  const client = useQueryClient();
  const router = useRouter();
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const me = session?.user.id;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<MemberInviteInput>({ resolver: zodResolver(MemberInviteSchema), defaultValues: { email: "", role: "editor" } });

  async function invite(values: MemberInviteInput) {
    try {
      await api(`/workspaces/${workspaceId}/invitations`, { method: "POST", body: values });
      reset({ email: "", role: values.role });
      invalidateAccess(client, workspaceId);
      toast.success(`Invitation sent to ${values.email}`);
    } catch (error) {
      setError("email", { message: error instanceof Error ? error.message : "Couldn't send the invitation" });
    }
  }

  async function changeRole(member: Member, role: WorkspaceRole) {
    try {
      await api(`/workspaces/${workspaceId}/members/${member.userId}`, { method: "PUT", body: { role } });
      toast.success(`${member.name} is now ${role === "owner" ? "an owner" : `an ${role}`}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change the role");
    } finally {
      invalidateAccess(client, workspaceId); // refetch so the select reflects what the server actually saved
    }
  }

  async function remove(member: Member) {
    setBusy(true);
    try {
      await api(`/workspaces/${workspaceId}/members/${member.userId}`, { method: "DELETE" });
      invalidateAccess(client, workspaceId);
      setRemoving(null);
      if (member.userId === me) {
        toast.success("You left the workspace");
        router.replace("/");
      } else {
        toast.success(`${member.name} was removed`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove the member");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/workspaces/${workspaceId}/invitations/${id}`, { method: "DELETE" });
      invalidateAccess(client, workspaceId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't revoke the invitation");
    }
  }

  return (
    <div className="space-y-10">
      {workspace.data ? (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
          You&apos;re {workspace.data.role === "viewer" ? "a" : "an"} <strong className="font-medium">{roleLabel(workspace.data.role)}</strong>. {roleHelp[workspace.data.role]}.
        </p>
      ) : null}

      {canManage ? (
        <section aria-labelledby="invite-heading">
          <h2 id="invite-heading" className="mb-3 text-lg font-semibold">Invite people</h2>
          <form onSubmit={handleSubmit(invite)} noValidate className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-start">
            <Field id="invite-email" label="Email address" error={errors.email?.message}>
              {(aria) => <Input {...aria} type="email" inputMode="email" autoComplete="off" placeholder="teammate@company.com" {...register("email")} />}
            </Field>
            <Field id="invite-role" label="Role" error={errors.role?.message}>
              {(aria) => (
                <Select {...aria} className="sm:w-32" {...register("role")}>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                  <option value="owner">Owner</option>
                </Select>
              )}
            </Field>
            <Button type="submit" variant="primary" loading={isSubmitting} className="sm:mt-[26px]">
              <UserPlus aria-hidden /> Send invite
            </Button>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-3 text-lg font-semibold">Members {members.data ? <span className="font-normal text-muted-foreground">· {members.data.length}</span> : null}</h2>
        <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
          {members.isLoading
            ? [0, 1].map((key) => <li key={key} className="p-4"><Skeleton className="h-9 w-full" /></li>)
            : members.data?.map((member) => (
                <li key={member.userId} className="flex flex-wrap items-center gap-3 border-b border-border p-3.5 last:border-b-0 sm:flex-nowrap">
                  <Avatar name={member.name} src={member.image} />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-medium">
                      {member.name} {member.userId === me ? <span className="font-normal text-muted-foreground">(you)</span> : null}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                  </div>
                  {canManage ? (
                    <Select aria-label={`Role for ${member.name}`} className="h-8 w-28" value={member.role} onChange={(event) => void changeRole(member, event.target.value as WorkspaceRole)}>
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </Select>
                  ) : (
                    <Badge tone={member.role === "owner" ? "primary" : "neutral"}>{roleLabel(member.role)}</Badge>
                  )}
                  {canManage && member.userId !== me ? (
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name}`} onClick={() => setRemoving(member)}>
                      <Trash2 aria-hidden />
                    </Button>
                  ) : member.userId === me ? (
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(member)}>
                      <LogOut aria-hidden /> Leave
                    </Button>
                  ) : null}
                </li>
              ))}
        </ul>
      </section>

      {canManage ? (
        <section aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="mb-3 text-lg font-semibold">Pending invitations</h2>
          {invitations.data && invitations.data.length > 0 ? (
            <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
              {invitations.data.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 border-b border-border p-3.5 last:border-b-0">
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"><Clock className="size-4" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{invite.email}</p>
                    <p className="text-sm text-muted-foreground">{roleLabel(invite.role)} · sent {timeAgo(invite.createdAt)}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void revoke(invite.id)}>Revoke</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          )}
        </section>
      ) : null}

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{removing?.userId === me ? "Leave this workspace?" : `Remove ${removing?.name}?`}</DialogTitle>
            <DialogDescription>
              {removing?.userId === me ? "You'll lose access to its documents immediately. An owner can invite you back." : "They'll lose access immediately, including any document they have open right now."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" loading={busy} onClick={() => removing && void remove(removing)}>
              {removing?.userId === me ? "Leave workspace" : "Remove member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
