import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { PageResult, RentalCashEntry } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { type RentalCashListQueryDto, rentalCashListQuerySchema } from "./dto/rental-cash.dto.js";
import { RentalCashService } from "./rental-cash.service.js";

/** 按唯一账单或结算目标查询有界收退款历史。 */
@Controller("rental-cash")
@UseGuards(AuthGuard, RbacGuard)
export class RentalCashController {
  constructor(private readonly cash: RentalCashService) {}

  @Get("list")
  list(
    @CurrentAuthContext() auth: AuthContext,
    @Query({ schema: rentalCashListQuerySchema }) dto: RentalCashListQueryDto,
  ): Promise<PageResult<RentalCashEntry>> {
    return this.cash.list(auth, dto);
  }
}
