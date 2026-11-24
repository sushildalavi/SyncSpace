"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { roleCan, type WorkspaceRole } from "@syncspace/contracts";
import { MembersPanel } from "@/components/app/members-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ShareDialog({ workspaceId, documentId, role }: { workspaceId: string; documentId: string; role: WorkspaceRole }) {
  const [copied, setCopied] = useState(false);
  const canInvite = roleCan(role, "member.manage");

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}/d/${documentId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Share2 aria-hidden /> Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share this document</DialogTitle>
          <DialogDescription>
            Access is granted per workspace: everyone below can open every document in it.{" "}
            {canInvite ? "Invite people or change roles here." : "Only owners can change who has access."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
          <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Only people with access can open the link.</p>
          <Button size="sm" onClick={copy}>
            {copied ? <Check aria-hidden /> : null} {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        <MembersPanel workspaceId={workspaceId} />
      </DialogContent>
    </Dialog>
  );
}
