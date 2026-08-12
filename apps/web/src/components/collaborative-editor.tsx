"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useAuth } from "@/stores/auth";
import { useCollaboration } from "@/hooks/use-collaboration";
import { useWorkspaceIntegrations } from "@/hooks/use-workspace-integrations";
import { apiFetch } from "@/lib/api";

type Provider = "slack" | "teams";

export function CollaborativeEditor({ documentId, workspaceId }: { documentId: string; workspaceId: string }) {
  const { token } = useAuth();
  const user = useAuth((state) => state.user);
  const integrations = useWorkspaceIntegrations(token, workspaceId);
  const { text, setText, connectionState, presence, currentVersion, reconnect } = useCollaboration({
    documentId,
    workspaceId,
    token,
    actorId: user?.id ?? ""
  });
  const [localText, setLocalText] = useState(text);
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);

  useEffect(() => {
    setLocalText(text);
  }, [text]);

  const summary = useMemo(() => buildSummary(localText), [localText]);
  const metrics = useMemo(() => buildMetrics(localText), [localText]);

  async function share(provider: Provider) {
    setBusyProvider(provider);
    try {
      await apiFetch(`/workspaces/${workspaceId}/integrations/${provider}/send`, {
        method: "POST",
        body: JSON.stringify({
          title: "SyncSpace update",
          summary,
          documentUrl: window.location.href
        })
      });
    } finally {
      setBusyProvider(null);
    }
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summary);
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_380px]">
      <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }} className="paper overflow-hidden">
        <div className="border-b border-slate-200/80 bg-white/80 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <span className="pill border-slate-200 bg-slate-100 text-slate-700">Collaborative editor</span>
            <span className="pill border-slate-200 bg-cyan-50 text-cyan-700">{connectionState}</span>
            <span className="pill border-slate-200 bg-slate-100 text-slate-700">Version {currentVersion}</span>
            <span className="ml-auto text-xs font-medium uppercase tracking-[0.28em] text-slate-500">
              {integrations.data?.some((item) => item.enabled) ? "Slack / Teams connected" : "No integrations yet"}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
            <button className="btn-secondary border-slate-200 text-slate-700 hover:bg-slate-100" onClick={reconnect}>
              Reconnect
            </button>
            <button className="btn-secondary border-slate-200 text-slate-700 hover:bg-slate-100" onClick={copySummary}>
              Copy summary
            </button>
            <button className="btn-secondary border-slate-200 text-slate-700 hover:bg-slate-100" onClick={() => share("slack")} disabled={!token || busyProvider !== null}>
              {busyProvider === "slack" ? "Sending…" : "Share to Slack"}
            </button>
            <button className="btn-secondary border-slate-200 text-slate-700 hover:bg-slate-100" onClick={() => share("teams")} disabled={!token || busyProvider !== null}>
              {busyProvider === "teams" ? "Sending…" : "Share to Teams"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Words" value={metrics.words} />
            <Metric label="Chars" value={metrics.characters} />
            <Metric label="Paragraphs" value={metrics.paragraphs} />
            <Metric label="Read time" value={`${metrics.readMinutes}m`} />
          </div>
        </div>

        <div className="bg-[#f8fafc] px-6 py-6">
          <textarea
            className="min-h-[72vh] w-full resize-none border-0 bg-transparent text-[1.03rem] leading-8 text-slate-900 outline-none placeholder:text-slate-400"
            value={localText}
            onChange={(event) => {
              setLocalText(event.target.value);
              setText(event.target.value);
            }}
            placeholder="Start writing your doc..."
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>Tip: keep one clear decision per section.</span>
            <span>Autosaves while you type.</span>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4">
        <SideCard title="Document signal" eyebrow="Live at a glance">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Words" value={metrics.words} tone="dark" />
            <Metric label="Read time" value={`${metrics.readMinutes}m`} tone="dark" />
            <Metric label="Collaborators" value={presence.length} tone="dark" />
            <Metric label="Version" value={currentVersion} tone="dark" />
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs uppercase tracking-[0.24em] text-slate-400">
            Summary: crisp enough to skim, structured enough to act on
          </div>
        </SideCard>

        <SideCard title="Live presence" eyebrow="People in the doc">
          <div className="space-y-3">
            {presence.length === 0 ? (
              <p className="text-sm text-slate-400">No one else is active right now.</p>
            ) : (
              presence.map((item) => (
                <div key={item.userId} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">{item.userName}</p>
                    <span className="pill">{item.status}</span>
                  </div>
                  {item.cursor ? <p className="mt-2 text-xs text-slate-400">Cursor {item.cursor.anchor} → {item.cursor.head}</p> : null}
                </div>
              ))
            )}
          </div>
        </SideCard>

        <SideCard title="Channel routing" eyebrow="Slack + Teams">
          <div className="space-y-3">
            {integrations.isLoading ? (
              <p className="text-sm text-slate-400">Loading integrations…</p>
            ) : integrations.data?.length ? (
              integrations.data.map((integration) => (
                <div key={integration._id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{integration.name}</p>
                      <p className="text-xs text-slate-400">{integration.provider.toUpperCase()}</p>
                    </div>
                    <span className={`pill ${integration.enabled ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-500/15 text-slate-300"}`}>
                      {integration.enabled ? "Active" : "Paused"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">No channel connections configured yet.</p>
            )}

            <a className="btn-secondary w-full justify-center border-white/10 text-white" href={`/workspaces/${workspaceId}/integrations`}>
              Configure integrations
            </a>
          </div>
        </SideCard>

        <SideCard title="Manus assistant" eyebrow="Turn text into action">
          <div className="space-y-3 text-sm text-slate-300">
            <p>Draft a clean summary, extract decisions, and prepare a channel-ready update.</p>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.26em] text-slate-400">Suggested update</p>
              <p className="mt-2 text-slate-100">{summary}</p>
            </div>
          </div>
        </SideCard>
      </div>
    </section>
  );
}

function SideCard({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <motion.aside initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }} className="surface-strong p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">{eyebrow}</p>
      <h2 className="mt-2 text-lg font-semibold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </motion.aside>
  );
}

function buildSummary(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "No content yet. Start by capturing the goal, the decision, and the next action.";
  }

  const words = trimmed.split(/\s+/);
  const preview = words.slice(0, 40).join(" ");
  return words.length > 40 ? `${preview}…` : preview;
}

function buildMetrics(text: string) {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const characters = text.replace(/\s/g, "").length;
  const paragraphs = trimmed ? trimmed.split(/\n+/).filter(Boolean).length : 0;
  const readMinutes = Math.max(1, Math.ceil(words / 220));

  return {
    words,
    characters,
    paragraphs,
    readMinutes
  };
}

function Metric({ label, value, tone = "light" }: { label: string; value: number | string; tone?: "light" | "dark" }) {
  const classes =
    tone === "dark"
      ? "rounded-2xl border border-white/10 bg-slate-950/70 p-3"
      : "rounded-2xl border border-slate-200/80 bg-white p-3";

  return (
    <div className={classes}>
      <p className={`text-[10px] uppercase tracking-[0.26em] ${tone === "dark" ? "text-slate-400" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "dark" ? "text-white" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
