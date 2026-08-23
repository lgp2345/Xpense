import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type { TransactionPage, TransactionRecord } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { CreateTransactionDto } from "./dto/create-transaction.dto.js";
import { DeleteTransactionDto } from "./dto/delete-transaction.dto.js";
import { ListTransactionsDto } from "./dto/list-transactions.dto.js";
import { TransactionDetailDto } from "./dto/transaction-detail.dto.js";
import { UpdateTransactionDto } from "./dto/update-transaction.dto.js";
import { TransactionsService } from "./transactions.service.js";

/** 暴露普通交易分页、详情、创建、完整更新与软删除接口。 */
@Controller("transactions")
@UseGuards(AuthGuard, RbacGuard)
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  /** 返回当前组织的有效普通交易分页。 */
  @Get("list")
  @RequirePermission("transactions:read")
  list(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: ListTransactionsDto,
  ): Promise<TransactionPage> {
    return this.service.list(authContext, dto);
  }

  /** 返回当前组织的一个有效普通交易详情。 */
  @Get("detail")
  @RequirePermission("transactions:read")
  detail(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: TransactionDetailDto,
  ): Promise<TransactionRecord> {
    return this.service.detail(authContext, dto);
  }

  /** 创建普通收入、支出或转账。 */
  @Post("create")
  @HttpCode(200)
  @RequirePermission("transactions:create")
  create(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionRecord> {
    return this.service.create(authContext, dto);
  }

  /** 使用完整业务输入更新当前组织交易。 */
  @Post("update")
  @HttpCode(200)
  @RequirePermission("transactions:update")
  update(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionRecord> {
    return this.service.update(authContext, dto);
  }

  /** 软删除当前组织交易；成员因无此精确权限会在服务执行前被 RBAC 拒绝。 */
  @Post("delete")
  @HttpCode(200)
  @RequirePermission("transactions:delete")
  delete(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: DeleteTransactionDto,
  ): Promise<void> {
    return this.service.delete(authContext, dto);
  }
}
