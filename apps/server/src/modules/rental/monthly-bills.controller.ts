import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import type {
  RentalBillDetail,
  RentalBillRevisionPreview,
  RentalMonthlyBillPreview,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { BillRevisionsService } from "./bill-revisions.service.js";
import {
  type GenerateRentalMonthlyBillDto,
  generateRentalMonthlyBillSchema,
  type PreviewRentalMonthlyBillDto,
  previewRentalMonthlyBillSchema,
  type ReviseRentalBillDto,
  reviseRentalBillSchema,
} from "./dto/rental-monthly-bills.dto.js";
import { MonthlyBillsService } from "./monthly-bills.service.js";

/** 月度综合账单只提供预览与正式确认，不接收客户端租金金额。 */
@Controller("rental-monthly-bills")
@UseGuards(AuthGuard, RbacGuard)
export class MonthlyBillsController {
  constructor(
    private readonly bills: MonthlyBillsService,
    private readonly revisions: BillRevisionsService,
  ) {}

  @Post("preview")
  @HttpCode(200)
  @RequirePermission([
    "rental_contracts:read",
    "rental_bills:read",
    "rental_monthly_bills:generate",
  ])
  preview(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: previewRentalMonthlyBillSchema }) dto: PreviewRentalMonthlyBillDto,
  ): Promise<RentalMonthlyBillPreview> {
    return this.bills.preview(auth, dto);
  }

  @Post("generate")
  @HttpCode(200)
  @RequirePermission([
    "rental_contracts:read",
    "rental_bills:read",
    "rental_monthly_bills:generate",
  ])
  generate(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: generateRentalMonthlyBillSchema }) dto: GenerateRentalMonthlyBillDto,
  ): Promise<RentalBillDetail> {
    return this.bills.generate(auth, dto);
  }

  @Post("adjust-preview")
  @HttpCode(200)
  @RequirePermission(["rental_bills:read", "rental_monthly_bills:adjust"])
  previewRevision(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: reviseRentalBillSchema.omit({ idempotencyKey: true }) }) dto: Omit<
      ReviseRentalBillDto,
      "idempotencyKey"
    >,
  ): Promise<RentalBillRevisionPreview> {
    return this.revisions.preview(auth, dto);
  }

  @Post("adjust")
  @HttpCode(200)
  @RequirePermission(["rental_bills:read", "rental_monthly_bills:adjust"])
  revise(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: reviseRentalBillSchema }) dto: ReviseRentalBillDto,
  ): Promise<RentalBillRevisionPreview> {
    return this.revisions.adjust(auth, dto);
  }
}
