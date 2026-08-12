"use client";

import { useState } from "react";
import { useAuth } from "@/stores/auth";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";

export function LoginPanel() {
  const router = useRouter();
  const setSession = useAuth((state) => state.setSession);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("sushil@example.com");
  const [password, setPassword] = useState("password123");
  const [displayName, setDisplayName] = useState("Sushil");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === "register"
          ? { email, password, displayName }
          : { email, password };
      const result = await apiFetch<{ token: string; user: { id: string; email: string; displayName: string } }>(
        `/auth/${mode}`,
        {
          method: "POST",
          body: JSON.stringify(body)
        }
      );
      setSession(result.token, result.user);
      router.push("/workspaces");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="surface-strong p-6 sm:p-8">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 text-sm">
        <button
          className={`rounded-full px-4 py-2 transition ${mode === "register" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-white/5"}`}
          onClick={() => setMode("register")}
        >
          Create account
        </button>
        <button
          className={`rounded-full px-4 py-2 transition ${mode === "login" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-white/5"}`}
          onClick={() => setMode("login")}
        >
          Sign in
        </button>
      </div>

      <div className="mt-8 space-y-4">
        {mode === "register" ? (
          <input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" />
        ) : null}
        <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
        <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
      </div>

      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : <p className="mt-4 text-sm text-slate-400">Use one account to keep your workspace, docs, and integrations together.</p>}

      <button
        className="btn-primary mt-6 w-full"
        onClick={submit}
        disabled={busy}
      >
        {busy ? "Working..." : mode === "register" ? "Create workspace account" : "Sign in"}
      </button>

      <div className="mt-6 grid grid-cols-3 gap-3 text-xs text-slate-300">
        <MiniStat label="Docs" value="Live" />
        <MiniStat label="Slack" value="Ready" />
        <MiniStat label="Teams" value="Ready" />
      </div>
    </aside>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
      <p className="text-[10px] uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
