import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import type { RentalCashEntry } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import {
  type ConfirmRentalRefundDto,
  confirmRentalRefundSchema,
  type RevokeRentalCashDto,
  revokeRentalCashSchema,
} from "./dto/rental-cash.dto.js";
import { RentalCashService } from "./rental-cash.service.js";

/** 按当前差额登记退款及撤销错误退款记录。 */
@Controller("rental-refunds")
@UseGuards(AuthGuard, RbacGuard)
export class RentalRefundsController {
  constructor(private readonly cash: RentalCashService) {}

  @Post("create")
  @HttpCode(200)
  @RequirePermission("rental_refunds:create")
  create(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: confirmRentalRefundSchema }) dto: ConfirmRentalRefundDto,
  ): Promise<RentalCashEntry> {
    return this.cash.confirmRefund(auth, dto);
  }

  @Post("revoke")
  @HttpCode(200)
  @RequirePermission("rental_refunds:revoke")
  revoke(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: revokeRentalCashSchema }) dto: RevokeRentalCashDto,
  ): Promise<RentalCashEntry> {
    return this.cash.revokeRefund(auth, dto);
  }
}
