"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { roleCan, type WorkspaceRole } from "@syncspace/contracts";
import { MembersPanel } from "@/components/app/members-panel";
import { SharesPanel } from "./shares-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ShareDialog({ workspaceId, documentId, role }: { workspaceId: string; documentId: string; role: WorkspaceRole }) {
  const [copied, setCopied] = useState(false);
  const canInvite = roleCan(role, "member.manage");
  const canShare = roleCan(role, "document.share");

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
            {canInvite ? "Share just this document, or invite someone to the whole workspace." : "Only owners can change who has access."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
          <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Only people with access can open the link.</p>
          <Button size="sm" onClick={copy}>
            {copied ? <Check aria-hidden /> : null} {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        {canShare ? <SharesPanel documentId={documentId} /> : null}
        <section aria-labelledby="members-heading" className="space-y-3">
          <div>
            <h3 id="members-heading" className="font-semibold">Everyone in the workspace</h3>
            <p className="text-sm text-muted-foreground">Members can open every document in it.</p>
          </div>
          <MembersPanel workspaceId={workspaceId} />
        </section>
      </DialogContent>
    </Dialog>
  );
}
