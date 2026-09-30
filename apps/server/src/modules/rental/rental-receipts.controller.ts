import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import type { RentalCashEntry } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import {
  type ConfirmRentalDepositReceiptDto,
  confirmRentalDepositReceiptSchema,
  type RecordRentalReceiptDto,
  type RevokeRentalCashDto,
  recordRentalReceiptSchema,
  revokeRentalCashSchema,
} from "./dto/rental-cash.dto.js";
import { RentalCashService } from "./rental-cash.service.js";

/** 收款登记、押金整额确认与误登记撤销。 */
@Controller("rental-receipts")
@UseGuards(AuthGuard, RbacGuard)
export class RentalReceiptsController {
  constructor(private readonly cash: RentalCashService) {}

  @Post("create")
  @HttpCode(200)
  @RequirePermission("rental_receipts:create")
  create(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: recordRentalReceiptSchema }) dto: RecordRentalReceiptDto,
  ): Promise<RentalCashEntry> {
    return this.cash.recordReceipt(auth, dto);
  }

  @Post("confirm-deposit")
  @HttpCode(200)
  @RequirePermission("rental_receipts:create")
  confirmDeposit(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: confirmRentalDepositReceiptSchema }) dto: ConfirmRentalDepositReceiptDto,
  ): Promise<RentalCashEntry> {
    return this.cash.confirmDepositReceipt(auth, dto);
  }

  @Post("revoke")
  @HttpCode(200)
  @RequirePermission("rental_receipts:revoke")
  revoke(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: revokeRentalCashSchema }) dto: RevokeRentalCashDto,
  ): Promise<RentalCashEntry> {
    return this.cash.revokeReceipt(auth, dto);
  }
}
