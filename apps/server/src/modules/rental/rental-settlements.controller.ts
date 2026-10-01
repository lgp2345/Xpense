import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type { RentalSettlementDetail, RentalSettlementPreview } from "@xpense/shared";
import { z } from "zod";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import {
  type ConfirmRentalSettlementDto,
  confirmRentalSettlementSchema,
  type PreviewRentalSettlementDto,
  previewRentalSettlementSchema,
} from "./dto/rental-settlements.dto.js";
import { RentalSettlementsService } from "./rental-settlements.service.js";

const settlementDetailSchema = z.object({ contractId: z.string().uuid() }).strict();
const settlementHistorySchema = z
  .object({
    contractId: z.string().uuid(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** 提供合同结算事件的版本预览、确认、详情和修订历史。 */
@Controller("rental-settlements")
@UseGuards(AuthGuard, RbacGuard)
export class RentalSettlementsController {
  constructor(private readonly settlements: RentalSettlementsService) {}

  @Get("detail")
  @RequirePermission(["rental_contracts:read", "rental_settlements:read"])
  detail(
    @CurrentAuthContext() auth: AuthContext,
    @Query({ schema: settlementDetailSchema }) dto: z.output<typeof settlementDetailSchema>,
  ): Promise<{ settlement: RentalSettlementDetail | null }> {
    return this.settlements.detail(auth, dto);
  }

  @Get("history")
  @RequirePermission(["rental_contracts:read", "rental_settlements:read"])
  history(
    @CurrentAuthContext() auth: AuthContext,
    @Query({ schema: settlementHistorySchema }) dto: z.output<typeof settlementHistorySchema>,
  ) {
    return this.settlements.history(auth, dto);
  }

  @Post("preview")
  @HttpCode(200)
  @RequirePermission(["rental_contracts:read", "rental_bills:read", "rental_settlements:confirm"])
  preview(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: previewRentalSettlementSchema }) dto: PreviewRentalSettlementDto,
  ): Promise<RentalSettlementPreview> {
    return this.settlements.preview(auth, dto);
  }

  @Post("confirm")
  @HttpCode(200)
  @RequirePermission(["rental_contracts:read", "rental_bills:read", "rental_settlements:confirm"])
  confirm(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: confirmRentalSettlementSchema }) dto: ConfirmRentalSettlementDto,
  ): Promise<RentalSettlementDetail> {
    return this.settlements.confirm(auth, dto);
  }
}
