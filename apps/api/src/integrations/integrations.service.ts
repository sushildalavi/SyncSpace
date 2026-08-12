import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { WorkspacesService } from "../workspaces/workspaces.service.js";

type UserContext = { id: string; email: string; displayName: string };

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async listForWorkspace(workspaceId: string, userId: string) {
    await this.workspacesService.requireMembership(workspaceId, userId);
    return this.database.models.integrations.find({ workspaceId }).sort({ provider: 1 }).lean();
  }

  async upsert(
    workspaceId: string,
    provider: "slack" | "teams",
    input: { name: string; webhookUrl: string; enabled: boolean },
    user: UserContext
  ) {
    await this.workspacesService.requireMembership(workspaceId, user.id, ["owner"]);
    const workspace = await this.workspacesService.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    const integration = await this.database.models.integrations.findOneAndUpdate(
      { workspaceId, provider },
      {
        workspaceId,
        provider,
        name: input.name,
        webhookUrl: input.webhookUrl,
        enabled: input.enabled,
        updatedBy: user.id,
        createdBy: user.id
      },
      { upsert: true, new: true }
    );

    return integration;
  }

  async remove(workspaceId: string, provider: "slack" | "teams", userId: string) {
    await this.workspacesService.requireMembership(workspaceId, userId, ["owner"]);
    const result = await this.database.models.integrations.deleteOne({ workspaceId, provider });
    if (result.deletedCount === 0) {
      throw new NotFoundException("Integration not found");
    }
  }

  async sendMessage(
    workspaceId: string,
    provider: "slack" | "teams",
    input: { title: string; summary: string; documentUrl: string },
    userId: string
  ) {
    await this.workspacesService.requireMembership(workspaceId, userId);
    const integration = await this.database.models.integrations.findOne({ workspaceId, provider, enabled: true }).lean();
    if (!integration) {
      throw new NotFoundException("Integration not configured");
    }

    const response = await fetch(integration.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildPayload(provider, integration.name, input))
    });

    if (!response.ok) {
      throw new Error(`Failed to deliver ${provider} notification`);
    }

    return {
      provider,
      delivered: true
    };
  }
}

function buildPayload(
  provider: "slack" | "teams",
  integrationName: string,
  input: { title: string; summary: string; documentUrl: string }
) {
  if (provider === "slack") {
    return {
      text: `SyncSpace update from ${integrationName}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: input.title
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: input.summary
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `<${input.documentUrl}|Open the document>`
            }
          ]
        }
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
