import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import type { AccountSummary } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { AccountsService } from "./accounts.service.js";
import { type CreateAccountDto, createAccountSchema } from "./dto/create-account.dto.js";
import { type DeleteAccountDto, deleteAccountSchema } from "./dto/delete-account.dto.js";
import { type UpdateAccountDto, updateAccountSchema } from "./dto/update-account.dto.js";

/** 暴露账户查询与管理接口。 */
@Controller("accounts")
@UseGuards(AuthGuard, RbacGuard)
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  /** 返回当前组织未删除账户及派生余额。 */
  @Get("list")
  @RequirePermission("accounts:read")
  list(@CurrentAuthContext() authContext: AuthContext): Promise<AccountSummary[]> {
    return this.service.list(authContext);
  }

  /** 创建账户；客户端不能指定组织和创建人。 */
  @Post("create")
  @HttpCode(200)
  @RequirePermission("accounts:create")
  create(
    @CurrentAuthContext() authContext: AuthContext,
    @Body({ schema: createAccountSchema }) dto: CreateAccountDto,
  ): Promise<AccountSummary> {
    return this.service.create(authContext, dto);
  }

  /** 更新当前组织账户。 */
  @Post("update")
  @HttpCode(200)
  @RequirePermission("accounts:update")
  update(
    @CurrentAuthContext() authContext: AuthContext,
    @Body({ schema: updateAccountSchema }) dto: UpdateAccountDto,
  ): Promise<AccountSummary> {
    return this.service.update(authContext, dto);
  }

  /** 软删除当前组织账户。 */
  @Post("delete")
  @HttpCode(200)
  @RequirePermission("accounts:delete")
  delete(
    @CurrentAuthContext() authContext: AuthContext,
    @Body({ schema: deleteAccountSchema }) dto: DeleteAccountDto,
  ): Promise<void> {
    return this.service.delete(authContext, dto);
  }
}
