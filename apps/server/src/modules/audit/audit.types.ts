export type AuditResult = "succeeded" | "failed";

export type AuditMetadata = Record<string, unknown>;

export type AppendAuditLogInput = {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  result: AuditResult;
  metadata?: AuditMetadata;
  requestId?: string | null;
};

export type AuditLogRecord = {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  result: AuditResult;
  metadata: AuditMetadata;
  requestId: string | null;
  createdAt: Date;
};

export type ListAuditLogsQuery = {
  action?: string;
  actorUserId?: string;
  targetType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export type ListCurrentOrganizationAuditLogsInput = ListAuditLogsQuery & {
  organizationId: string;
};
