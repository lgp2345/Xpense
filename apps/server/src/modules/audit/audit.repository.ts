import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { auditLogs } from "../../db/schema.js";
import type {
  AppendAuditLogInput,
  AuditLogRecord,
  AuditMetadata,
  ListCurrentOrganizationAuditLogsInput,
} from "./audit.types.js";

@Injectable()
export class AuditRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async append(input: AppendAuditLogInput, executor: AppDbExecutor = this.db): Promise<void> {
    await executor.insert(auditLogs).values({
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      result: input.result,
      metadata: input.metadata ?? {},
      requestId: input.requestId ?? null,
    });
  }

  async listCurrentOrganizationLogs(
    input: ListCurrentOrganizationAuditLogsInput,
  ): Promise<AuditLogRecord[]> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    const conditions: SQL[] = [eq(auditLogs.organizationId, input.organizationId)];

    if (input.action) {
      conditions.push(eq(auditLogs.action, input.action));
    }

    if (input.actorUserId) {
      conditions.push(eq(auditLogs.actorUserId, input.actorUserId));
    }

    if (input.targetType) {
      conditions.push(eq(auditLogs.targetType, input.targetType));
    }

    if (input.from) {
      conditions.push(gte(auditLogs.createdAt, input.from));
    }

    if (input.to) {
      conditions.push(lte(auditLogs.createdAt, input.to));
    }

    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return rows.map((row) => ({
      ...row,
      metadata: row.metadata as AuditMetadata,
    }));
  }
}
