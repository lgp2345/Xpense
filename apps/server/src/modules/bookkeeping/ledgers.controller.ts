import { Controller, Get, UseGuards } from "@nestjs/common";
import type { LedgerSummary } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { LedgersService } from "./ledgers.service.js";

/** 暴露账本只读接口。 */
@Controller("ledgers")
@UseGuards(AuthGuard, RbacGuard)
export class LedgersController {
  constructor(private readonly service: LedgersService) {}

  /**
   * 返回当前组织的有效账本。
   * @param authContext 可信认证上下文。
   */
  @Get("list")
  @RequirePermission("ledgers:read")
  list(@CurrentAuthContext() authContext: AuthContext): Promise<LedgerSummary[]> {
    return this.service.list(authContext);
  }
}
