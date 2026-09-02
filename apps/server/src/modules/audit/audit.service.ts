import { Inject, Injectable, Optional } from "@nestjs/common";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { createRequestLogger } from "../../common/logging/request-logger.js";
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

const sensitiveMetadataKeys = new Set(
  [
    "password",
    "token",
    "refreshToken",
    "refreshTokenHash",
    "ip",
    "documentNumber",
    "documentAddress",
    "birthDate",
    "gender",
    "ethnicity",
    "phone",
    "email",
    "note",
    "reason",
  ].map((key) => key.toLowerCase()),
);

@Injectable()
export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    @Optional()
    @Inject(AUDIT_LOGGER)
    private readonly logger: AuditLogger = createRequestLogger(AuditService.name),
  ) {}

  async append(input: AppendAuditLogInput): Promise<void> {
    try {
      await this.appendRequired(input);
    } catch {
      this.logger.error({
        message: "Failed to append audit log",
        action: input.action,
        targetType: input.targetType,
      });
    }
  }

  async appendRequired(input: AppendAuditLogInput, executor?: AppDbExecutor): Promise<void> {
    const requestId = input.requestId ?? requestContext.getRequestId() ?? null;
    const sanitizedInput = {
      ...input,
      requestId,
      metadata: this.sanitizeMetadata(input.metadata),
    };

    await (executor
      ? this.repository.append(sanitizedInput, executor)
      : this.repository.append(sanitizedInput));
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

    try {
      return sanitizeMetadataRecord(metadata);
    } catch {
      throw new Error("Unsafe audit metadata");
    }
  }
}

/** 递归剔除对象与数组中禁止进入审计元数据的敏感键。 */
function sanitizeMetadataRecord(metadata: AuditMetadata): AuditMetadata {
  return sanitizeMetadataObject(metadata, new WeakSet<object>());
}

function sanitizeMetadataObject(value: object, ancestors: WeakSet<object>): AuditMetadata {
  assertNotCircular(value, ancestors);
  ancestors.add(value);

  try {
    const sanitized: AuditMetadata = Object.create(null);
    for (const key of Object.keys(value)) {
      if (sensitiveMetadataKeys.has(key.toLowerCase())) continue;

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) throw new Error("Unsafe audit metadata");
      if (typeof descriptor.value === "function") continue;

      Object.defineProperty(sanitized, key, {
        value: sanitizeMetadataValue(descriptor.value, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return sanitized;
  } finally {
    ancestors.delete(value);
  }
}

function sanitizeMetadataArray(value: unknown[], ancestors: WeakSet<object>): unknown[] {
  assertNotCircular(value, ancestors);
  ancestors.add(value);

  try {
    const sanitized = new Array<unknown>(value.length);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) continue;
      if (!("value" in descriptor)) throw new Error("Unsafe audit metadata");

      sanitized[index] = sanitizeMetadataValue(descriptor.value, ancestors);
    }
    return sanitized;
  } finally {
    ancestors.delete(value);
  }
}

function sanitizeMetadataValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === "function" || typeof value === "symbol") return null;
  if (typeof value === "bigint") throw new Error("Unsafe audit metadata");
  if (Array.isArray(value)) return sanitizeMetadataArray(value, ancestors);
  if (value !== null && typeof value === "object") {
    return sanitizeMetadataObject(value, ancestors);
  }
  return value;
}

function assertNotCircular(value: object, ancestors: WeakSet<object>): void {
  if (ancestors.has(value)) throw new Error("Unsafe audit metadata");
}
