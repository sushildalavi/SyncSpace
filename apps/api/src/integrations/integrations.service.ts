import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { AccessService } from "../access/access.service.js";
import type { AuthenticatedUser } from "../auth/session.guard.js";
import { DB, type Db } from "../db/database.module.js";
import { workspaceIntegration } from "../db/schema.js";

type Provider = "slack" | "teams";

const ALLOWED_HOSTS: Record<Provider, RegExp[]> = {
  slack: [/^hooks\.slack\.com$/],
  teams: [/\.webhook\.office\.com$/, /^outlook\.office\.com$/, /\.logic\.azure\.com$/, /\.powerplatform\.com$/]
};

/** Webhooks are server-side requests to a user-supplied URL, so only the providers' own hosts are allowed. */
export function assertWebhookAllowed(provider: Provider, rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException("Enter a valid webhook URL");
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS[provider].some((pattern) => pattern.test(url.hostname))) {
    throw new BadRequestException(`That doesn't look like a ${provider === "slack" ? "Slack" : "Microsoft Teams"} webhook URL`);
  }
}

function maskWebhook(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}/…${url.pathname.slice(-4)}`;
  } catch {
    return "…";
  }
}

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AccessService) private readonly access: AccessService
  ) {}

  async list(workspaceId: string, userId: string) {
    await this.access.requireWorkspace(workspaceId, userId, "workspace.read");
    const rows = await this.db.select().from(workspaceIntegration).where(eq(workspaceIntegration.workspaceId, workspaceId)).orderBy(asc(workspaceIntegration.provider));
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      enabled: row.enabled,
      webhookHint: maskWebhook(row.webhookUrl),
      updatedAt: row.updatedAt
    }));
  }

  async upsert(workspaceId: string, provider: Provider, input: { name: string; webhookUrl: string; enabled: boolean }, user: AuthenticatedUser) {
    await this.access.requireWorkspace(workspaceId, user.id, "integration.manage");
    assertWebhookAllowed(provider, input.webhookUrl);
    const [row] = await this.db
      .insert(workspaceIntegration)
      .values({ workspaceId, provider, ...input, createdBy: user.id, updatedBy: user.id })
      .onConflictDoUpdate({
        target: [workspaceIntegration.workspaceId, workspaceIntegration.provider],
        set: { ...input, updatedBy: user.id }
      })
      .returning();
    return { id: row!.id, provider: row!.provider, name: row!.name, enabled: row!.enabled, webhookHint: maskWebhook(row!.webhookUrl), updatedAt: row!.updatedAt };
  }

  async remove(workspaceId: string, provider: Provider, userId: string) {
    await this.access.requireWorkspace(workspaceId, userId, "integration.manage");
    const rows = await this.db
      .delete(workspaceIntegration)
      .where(and(eq(workspaceIntegration.workspaceId, workspaceId), eq(workspaceIntegration.provider, provider)))
      .returning({ id: workspaceIntegration.id });
    if (rows.length === 0) {
      throw new NotFoundException("Integration not found");
    }
  }

  async send(workspaceId: string, provider: Provider, input: { title: string; summary: string; documentUrl: string }, userId: string) {
    await this.access.requireWorkspace(workspaceId, userId, "integration.send");
    const [integration] = await this.db
      .select()
      .from(workspaceIntegration)
      .where(and(eq(workspaceIntegration.workspaceId, workspaceId), eq(workspaceIntegration.provider, provider), eq(workspaceIntegration.enabled, true)))
      .limit(1);
    if (!integration) {
      throw new NotFoundException("Integration not configured");
    }
    assertWebhookAllowed(provider, integration.webhookUrl);
    const response = await fetch(integration.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(provider, integration.name, input)),
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      throw new BadRequestException(`${provider} rejected the notification (${response.status})`);
    }
    return { provider, delivered: true };
  }
}

function buildPayload(provider: Provider, integrationName: string, input: { title: string; summary: string; documentUrl: string }) {
  if (provider === "slack") {
    return {
      text: `SyncSpace update from ${integrationName}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: input.title } },
        { type: "section", text: { type: "mrkdwn", text: input.summary } },
        { type: "context", elements: [{ type: "mrkdwn", text: `<${input.documentUrl}|Open the document>` }] }
      ]
    };
  }
  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    summary: input.title,
    themeColor: "38bdf8",
    title: input.title,
    text: input.summary,
    sections: [
      {
        activityTitle: `SyncSpace · ${integrationName}`,
        activitySubtitle: "Document update",
        facts: [
          { name: "Document", value: input.title },
          { name: "Open", value: input.documentUrl }
        ],
        markdown: true
      }
    ]
  };
}
