"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { HaikeiBackdrop } from "@/components/haikei-backdrop";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/stores/auth";

export default function MembersPage() {
  const params = useParams<{ workspaceId: string }>();
  const { token } = useAuth();
  const workspace = useWorkspace(token, params.workspaceId);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <HaikeiBackdrop />
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl flex-col gap-4">
        <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="glass-nav flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href={`/workspaces/${params.workspaceId}`} className="btn-secondary border-white/10 text-white">
              Back to workspace
            </Link>
            <span className="pill">Members</span>
          </div>
          <span className="text-sm text-slate-300">{workspace.data?.name ?? "Workspace"}</span>
        </motion.header>

        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="surface p-6">
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/80">Workspace members</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">People with access</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Member management is powered by the server RBAC rules. The UI is intentionally calm and direct so you can see who belongs here without wading through admin clutter.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Owners", value: "1" },
              { label: "Editors", value: "3" },
              { label: "Viewers", value: "2" }
            ].map((item) => (
              <div key={item.label} className="rounded-[24px] border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/70 p-5 text-sm text-slate-300">
            Invite forms and role editing can be added here next, once the team wants the full admin surface in-product.
          </div>
        </motion.section>
      </div>
    </main>
  );
}
