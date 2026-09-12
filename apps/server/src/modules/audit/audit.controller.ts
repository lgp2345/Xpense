import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { AuditService } from "./audit.service.js";
import type { AuditLogRecord } from "./audit.types.js";
import { type ListAuditLogsDto, listAuditLogsSchema } from "./dto/list-audit-logs.dto.js";

@Controller("audit-logs")
@UseGuards(AuthGuard, RbacGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("list")
  @RequirePermission("audit_logs:read")
  listCurrentOrganizationLogs(
    @CurrentAuthContext() authContext: AuthContext,
    @Query({ schema: listAuditLogsSchema }) query: ListAuditLogsDto,
  ): Promise<AuditLogRecord[]> {
    return this.auditService.listCurrentOrganizationLogs(authContext, query);
  }
}
