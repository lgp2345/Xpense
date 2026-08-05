import { Inject, Injectable, Logger, Optional } from "@nestjs/common";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { requestContext } from "../../common/request-context/request-context.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { AuditRepository } from "./audit.repository.js";
import type {
  AppendAuditLogInput,
  AuditLogRecord,
  AuditMetadata,
  ListAuditLogsQuery,
} from "./audit.types.js";

type AuditLogger = {
  error(message: unknown): void;
};

const AUDIT_LOGGER = Symbol("AUDIT_LOGGER");

const sensitiveMetadataKeys = new Set([
  "password",
  "token",
  "refreshToken",
  "refreshTokenHash",
  "ip",
]);

@Injectable()
export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    @Optional()
    @Inject(AUDIT_LOGGER)
    private readonly logger: AuditLogger = new Logger(AuditService.name),
  ) {}

  async append(input: AppendAuditLogInput): Promise<void> {
    try {
      await this.appendRequired(input);
    } catch (error) {
      this.logger.error({
        message: "Failed to append audit log",
        action: input.action,
        targetType: input.targetType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  appendRequired(input: AppendAuditLogInput, executor?: AppDbExecutor): Promise<void> {
    const requestId = input.requestId ?? requestContext.getRequestId() ?? null;
    const sanitizedInput = {
      ...input,
      requestId,
      metadata: this.sanitizeMetadata(input.metadata),
    };

    return executor
      ? this.repository.append(sanitizedInput, executor)
      : this.repository.append(sanitizedInput);
  }

  listCurrentOrganizationLogs(
    authContext: AuthContext,
    query: ListAuditLogsQuery,
  ): Promise<AuditLogRecord[]> {
    return this.repository.listCurrentOrganizationLogs({
      organizationId: authContext.organizationId,
      ...query,
    });
  }

  private sanitizeMetadata(metadata: AuditMetadata | undefined): AuditMetadata {
    if (!metadata) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !sensitiveMetadataKeys.has(key)),
    );
  }
}
