import { Dependencies, Injectable, Logger } from "@nestjs/common";

import type { AuthContext } from "../../common/auth/auth-context.js";
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

const sensitiveMetadataKeys = new Set([
  "password",
  "token",
  "refreshToken",
  "refreshTokenHash",
  "ip",
]);

@Injectable()
@Dependencies(AuditRepository)
export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
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

  appendRequired(input: AppendAuditLogInput): Promise<void> {
    return this.repository.append({
      ...input,
      metadata: this.sanitizeMetadata(input.metadata),
    });
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
