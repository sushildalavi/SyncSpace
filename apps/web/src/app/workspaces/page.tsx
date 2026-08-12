"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { HaikeiBackdrop } from "@/components/haikei-backdrop";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useAuth } from "@/stores/auth";

export default function WorkspacesPage() {
  const { user, token, logout } = useAuth();
  const { data, isLoading } = useWorkspaces(token);

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
        <div className="surface-strong p-8">
          <p className="text-lg text-white">You need to sign in first.</p>
          <Link className="btn-primary mt-4" href="/">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <HaikeiBackdrop />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col gap-4">
        <motion.header initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="glass-nav flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Workspace selector</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Your workspaces</h1>
          </div>
          <button className="btn-secondary border-white/10 text-white" onClick={logout}>
            Sign out
          </button>
        </motion.header>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="surface p-6">
            <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/80">Welcome back</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{user.displayName}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Choose a workspace to jump straight into the docs, integrations, and shared memory for the team.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
              <Stat label="Docs" value="Live" />
              <Stat label="Channels" value="Slack / Teams" />
              <Stat label="Mode" value="Focus first" />
            </div>
          </motion.div>

          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }} className="surface-strong p-6">
            <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/80">Workspace cards</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {isLoading ? (
                <Card>Loading workspaces…</Card>
              ) : (
                data?.map((workspace) => (
                  <Link
                    key={workspace._id}
                    href={`/workspaces/${workspace._id}`}
                    className="rounded-[28px] border border-white/10 bg-white/5 p-5 transition hover:-translate-y-0.5 hover:bg-white/10"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Workspace</p>
                    <h2 className="mt-3 text-2xl font-semibold text-white">{workspace.name}</h2>
                    <p className="mt-2 text-sm text-slate-400">Role: {workspace.membership?.role ?? "member"}</p>
                  </Link>
                ))
              )}
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 text-slate-300">{children}</div>;
}
