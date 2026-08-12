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
    <aside className="rounded-3xl border border-white/10 bg-slate-950/80 p-8 shadow-glow">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 text-sm">
        <button
          className={`rounded-full px-4 py-2 ${mode === "register" ? "bg-cyan-400 text-slate-950" : "text-slate-300"}`}
          onClick={() => setMode("register")}
        >
          Create account
        </button>
        <button
          className={`rounded-full px-4 py-2 ${mode === "login" ? "bg-cyan-400 text-slate-950" : "text-slate-300"}`}
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

      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

      <button
        className="mt-6 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
        onClick={submit}
        disabled={busy}
      >
        {busy ? "Working..." : mode === "register" ? "Create workspace account" : "Sign in"}
      </button>
    </aside>
  );
}
