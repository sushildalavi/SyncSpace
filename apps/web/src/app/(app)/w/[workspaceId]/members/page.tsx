"use client";

import { useParams } from "next/navigation";
import { MembersPanel } from "@/components/app/members-panel";
import { Page, PageHeader } from "@/components/app/page";

export default function MembersPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return (
    <Page narrow>
      <PageHeader title="Members" description="Control who can read and edit this workspace." />
      <MembersPanel workspaceId={workspaceId} />
    </Page>
  );
}
