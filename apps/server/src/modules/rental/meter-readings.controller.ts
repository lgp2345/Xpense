import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { type ContractDetailDto, contractDetailSchema } from "./dto/contract-detail.dto.js";
import {
  type UpdateRentalMeterBaselineDto,
  updateRentalMeterBaselineSchema,
} from "./dto/rental-meters.dto.js";
import { MeterReadingsService, type RentalMeterBaselineDetail } from "./meter-readings.service.js";

/** 入住水电底数读取与登记接口。 */
@Controller("rental-meters")
@UseGuards(AuthGuard, RbacGuard)
export class MeterReadingsController {
  constructor(private readonly meters: MeterReadingsService) {}

  @Get("detail")
  @RequirePermission(["rental_contracts:read", "rental_meters:read"])
  detail(
    @CurrentAuthContext() auth: AuthContext,
    @Query({ schema: contractDetailSchema }) dto: ContractDetailDto,
  ): Promise<RentalMeterBaselineDetail> {
    return this.meters.detail(auth, { contractId: dto.id });
  }

  @Post("update")
  @HttpCode(200)
  @RequirePermission(["rental_contracts:read", "rental_meters:update"])
  update(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: updateRentalMeterBaselineSchema }) dto: UpdateRentalMeterBaselineDto,
  ): Promise<RentalMeterBaselineDetail> {
    return this.meters.update(auth, dto);
  }
}
