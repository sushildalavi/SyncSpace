"use client";

import Link from "next/link";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useAuth } from "@/stores/auth";

export default function WorkspacesPage() {
  const { user, token, logout } = useAuth();
  const { data, isLoading } = useWorkspaces(token);

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <p className="text-lg text-white">You need to sign in first.</p>
          <Link className="mt-4 inline-flex rounded-xl bg-cyan-500 px-4 py-2 font-medium text-slate-950" href="/">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Workspace selector</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Your workspaces</h1>
        </div>
        <button className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200" onClick={logout}>
          Sign out
        </button>
      </header>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {isLoading ? (
          <Card>Loading workspaces...</Card>
        ) : (
          data?.map((workspace) => (
            <Link
              key={workspace._id}
              href={`/workspaces/${workspace._id}`}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Workspace</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">{workspace.name}</h2>
              <p className="mt-2 text-sm text-slate-400">Role: {workspace.membership?.role ?? "member"}</p>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-300">{children}</div>;
}
