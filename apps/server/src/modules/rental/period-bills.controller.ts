import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import {
  type PeriodBillContextDto,
  periodBillContextSchema,
  type PreviewRentalPeriodBillDto,
  previewRentalPeriodBillSchema,
  type GenerateRentalPeriodBillDto,
  generateRentalPeriodBillSchema,
} from "./dto/rental-period-bills.dto.js";
import { PeriodBillsService } from "./period-bills.service.js";
@Controller("rental-period-bills")
@UseGuards(AuthGuard, RbacGuard)
export class PeriodBillsController {
  constructor(private readonly bills: PeriodBillsService) {}
  @Get("context")
  @RequirePermission(["rental_contracts:read", "rental_bills:read", "rental_period_bills:generate"])
  context(
    @CurrentAuthContext() auth: AuthContext,
    @Query({ schema: periodBillContextSchema }) dto: PeriodBillContextDto,
  ) {
    return this.bills.context(auth, dto);
  }
  @Post("preview")
  @HttpCode(200)
  @RequirePermission(["rental_contracts:read", "rental_bills:read", "rental_period_bills:generate"])
  preview(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: previewRentalPeriodBillSchema }) dto: PreviewRentalPeriodBillDto,
  ) {
    return this.bills.preview(auth, dto);
  }
  @Post("generate")
  @HttpCode(200)
  @RequirePermission(["rental_contracts:read", "rental_bills:read", "rental_period_bills:generate"])
  generate(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: generateRentalPeriodBillSchema }) dto: GenerateRentalPeriodBillDto,
  ) {
    return this.bills.generate(auth, dto);
  }
}
