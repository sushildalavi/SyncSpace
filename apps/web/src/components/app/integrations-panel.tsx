"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { Integration } from "@/lib/queries";

const providers = [
  { id: "slack", label: "Slack", placeholder: "https://hooks.slack.com/services/…" },
  { id: "teams", label: "Microsoft Teams", placeholder: "https://example.webhook.office.com/webhookb2/…" }
] as const;

const Schema = z.object({ name: z.string().trim().min(1, "Give it a name").max(120), webhookUrl: z.string().url("Enter a valid https URL"), enabled: z.boolean() });

function ProviderCard({ workspaceId, provider, existing }: { workspaceId: string; provider: (typeof providers)[number]; existing?: Integration | undefined }) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["integrations", workspaceId] });
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<z.infer<typeof Schema>>({ resolver: zodResolver(Schema), defaultValues: { name: existing?.name ?? provider.label, webhookUrl: "", enabled: existing?.enabled ?? true } });

  const remove = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/integrations/${provider.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      toast.success(`${provider.label} disconnected`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't disconnect")
  });

  return (
    <form
      noValidate
      className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-xs"
      onSubmit={handleSubmit(async (values) => {
        try {
          await api(`/workspaces/${workspaceId}/integrations/${provider.id}`, { method: "PUT", body: values });
          await refresh();
          toast.success(`${provider.label} saved`);
        } catch (error) {
          setError("webhookUrl", { message: error instanceof Error ? error.message : "Couldn't save" });
        }
      })}
    >
      <div className="flex items-center gap-3">
        <h3 className="flex-1 text-base font-semibold">{provider.label}</h3>
        {existing ? <Badge tone={existing.enabled ? "success" : "neutral"}>{existing.enabled ? "Connected" : "Paused"}</Badge> : <Badge>Not connected</Badge>}
      </div>
      <Field id={`${provider.id}-name`} label="Display name" error={errors.name?.message}>
        {(aria) => <Input {...aria} {...register("name")} />}
      </Field>
      <Field id={`${provider.id}-url`} label="Webhook URL" hint={existing ? `Saved as ${existing.webhookHint}. Paste a new URL to replace it.` : "Stored server-side and never shown again."} error={errors.webhookUrl?.message}>
        {(aria) => <Input {...aria} type="url" autoComplete="off" placeholder={provider.placeholder} {...register("webhookUrl")} />}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={watch("enabled")} onCheckedChange={(value) => setValue("enabled", value)} aria-label={`${provider.label} notifications enabled`} />
          Enabled
        </label>
        <div className="ml-auto flex gap-2">
          {existing ? (
            <Button type="button" variant="ghost" onClick={() => remove.mutate()} loading={remove.isPending}>
              <Trash2 aria-hidden /> Disconnect
            </Button>
          ) : null}
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {existing ? "Update" : "Connect"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function IntegrationsPanel({ workspaceId }: { workspaceId: string }) {
  const { data } = useQuery({ queryKey: ["integrations", workspaceId], queryFn: () => api<Integration[]>(`/workspaces/${workspaceId}/integrations`) });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {providers.map((provider) => (
        <ProviderCard key={`${provider.id}-${data?.find((item) => item.provider === provider.id)?.id ?? "new"}`} workspaceId={workspaceId} provider={provider} existing={data?.find((item) => item.provider === provider.id)} />
      ))}
    </div>
  );
}
