import { Inject, Injectable } from "@nestjs/common";
import { DB, type Db } from "../db/database.module.js";
import { auditEvent } from "../db/schema.js";

export type AuditInput = {
  type: string;
  actorId?: string | null;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

type Executor = Pick<Db, "insert">;

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Pass a transaction as `executor` so the audit row commits or rolls back with the change. */
  async record(input: AuditInput, executor: Executor = this.db): Promise<void> {
    await executor.insert(auditEvent).values({
      type: input.type,
      actorId: input.actorId ?? null,
      workspaceId: input.workspaceId ?? null,
      metadata: input.metadata ?? {},
      ipAddress: input.ip ?? null
    });
  }
}
