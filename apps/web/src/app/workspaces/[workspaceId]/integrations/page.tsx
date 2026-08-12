"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/stores/auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceIntegrations, type WorkspaceIntegration } from "@/hooks/use-workspace-integrations";
import { apiFetch } from "@/lib/api";
import { HaikeiBackdrop } from "@/components/haikei-backdrop";

type Provider = "slack" | "teams";

type FormState = {
  name: string;
  webhookUrl: string;
  enabled: boolean;
};

const EMPTY: Record<Provider, FormState> = {
  slack: {
    name: "Slack",
    webhookUrl: "",
    enabled: true
  },
  teams: {
    name: "Teams",
    webhookUrl: "",
    enabled: true
  }
};

export default function IntegrationsPage() {
  const params = useParams<{ workspaceId: string }>();
  const { token } = useAuth();
  const workspace = useWorkspace(token, params.workspaceId);
  const integrations = useWorkspaceIntegrations(token, params.workspaceId);
  const [forms, setForms] = useState<Record<Provider, FormState>>(EMPTY);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const next = { ...EMPTY };
    for (const integration of integrations.data ?? []) {
      next[integration.provider] = {
        name: integration.name,
        webhookUrl: integration.webhookUrl,
        enabled: integration.enabled
      };
    }
    setForms(next);
  }, [integrations.data]);

  const providers = useMemo<Provider[]>(() => ["slack", "teams"], []);

  async function save(provider: Provider) {
    setBusy(provider);
    setMessage(null);
    try {
      await apiFetch(`/workspaces/${params.workspaceId}/integrations/${provider}`, {
        method: "PUT",
        body: JSON.stringify(forms[provider])
      });
      await integrations.refetch();
      setMessage(`${provider === "slack" ? "Slack" : "Teams"} connection saved.`);
    } finally {
      setBusy(null);
    }
  }

  async function sendPreview(provider: Provider) {
    setBusy(provider);
    setMessage(null);
    try {
      await apiFetch(`/workspaces/${params.workspaceId}/integrations/${provider}/send`, {
        method: "POST",
        body: JSON.stringify({
          title: `${workspace.data?.name ?? "Workspace"} update`,
          summary:
            "A polished, docs-like collaboration surface is now live. It includes the editor canvas, presence, and channel routing.",
          documentUrl: `${window.location.origin}/workspaces/${params.workspaceId}`
        })
      });
      setMessage(`${provider === "slack" ? "Slack" : "Teams"} preview sent.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <HaikeiBackdrop />
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col gap-4">
        <motion.header initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }} className="glass-nav flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href={`/workspaces/${params.workspaceId}`} className="btn-secondary border-white/10 text-white">
              Back to workspace
            </Link>
            <span className="pill">Slack + Teams</span>
          </div>
          <span className="text-sm text-slate-300">{workspace.data?.name ?? "Workspace"}</span>
        </motion.header>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="surface p-6">
            <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/80">Integrations</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Route important updates to Slack or Teams</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Keep team comms where people already work. SyncSpace can publish a short, useful update when a document changes or when you want to share a draft manually.
            </p>

            <div className="mt-8 grid gap-4">
              {providers.map((provider) => (
                <IntegrationForm
                  key={provider}
                  provider={provider}
                  form={forms[provider]}
                  busy={busy === provider}
                  onChange={(next) => setForms((current) => ({ ...current, [provider]: next }))}
                  onSave={() => save(provider)}
                  onSendPreview={() => sendPreview(provider)}
                />
              ))}
            </div>
          </motion.div>

          <motion.aside initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }} className="surface-strong p-6">
            <p className="text-xs uppercase tracking-[0.34em] text-cyan-200/80">Connected state</p>
            <h2 className="mt-2 text-xl font-semibold text-white">What happens when you wire this up</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p>• Slack gets a concise message with the doc title and a link back into SyncSpace.</p>
              <p>• Teams receives the same update in a clean card-style payload.</p>
              <p>• Owners can keep the connection active or pause it without breaking the workspace.</p>
              <p>• The editor can reuse the same route when someone wants to publish a draft manually.</p>
            </div>
            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}

            <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Current connections</p>
              <div className="mt-3 space-y-3">
                {(integrations.data ?? []).length ? (
                  integrations.data?.map((integration: WorkspaceIntegration) => (
                    <div key={integration._id} className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{integration.name}</p>
                          <p className="text-xs text-slate-400">{integration.provider.toUpperCase()}</p>
                        </div>
                        <span className="pill">{integration.enabled ? "Active" : "Paused"}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">No integrations configured yet.</p>
                )}
              </div>
            </div>
          </motion.aside>
        </section>
      </div>
    </main>
  );
}

function IntegrationForm({
  provider,
  form,
  busy,
  onChange,
  onSave,
  onSendPreview
}: {
  provider: Provider;
  form: FormState;
  busy: boolean;
  onChange: (next: FormState) => void;
  onSave: () => void;
  onSendPreview: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200/70 bg-white p-5 text-slate-900 shadow-[0_18px_80px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{provider.toUpperCase()}</p>
          <h3 className="mt-1 text-lg font-semibold">{form.name}</h3>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => onChange({ ...form, enabled: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 grid gap-3">
        <input
          className="field-light"
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          placeholder={`${provider} channel name`}
        />
        <input
          className="field-light"
          value={form.webhookUrl}
          onChange={(event) => onChange({ ...form, webhookUrl: event.target.value })}
          placeholder="Webhook URL"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save connection"}
        </button>
        <button className="btn-secondary border-slate-200 text-slate-700" onClick={onSendPreview} disabled={busy}>
          Send preview
        </button>
      </div>
    </div>
  );
}
