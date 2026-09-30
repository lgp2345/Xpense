import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type { RentalChargeTerms } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { ChargeTermsService } from "./charge-terms.service.js";
import { type ContractDetailDto, contractDetailSchema } from "./dto/contract-detail.dto.js";
import {
  type UpdateRentalChargeTermsDto,
  updateRentalChargeTermsSchema,
} from "./dto/rental-charges.dto.js";

/** 合同默认水电单价与固定月费接口。 */
@Controller("rental-charges")
@UseGuards(AuthGuard, RbacGuard)
export class ChargeTermsController {
  constructor(private readonly charges: ChargeTermsService) {}

  @Get("detail")
  @RequirePermission(["rental_contracts:read", "rental_charges:read"])
  detail(
    @CurrentAuthContext() auth: AuthContext,
    @Query({ schema: contractDetailSchema }) dto: ContractDetailDto,
  ): Promise<RentalChargeTerms> {
    return this.charges.detail(auth, { contractId: dto.id });
  }

  @Post("update")
  @HttpCode(200)
  @RequirePermission(["rental_contracts:read", "rental_charges:update"])
  update(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: updateRentalChargeTermsSchema }) dto: UpdateRentalChargeTermsDto,
  ): Promise<RentalChargeTerms> {
    return this.charges.update(auth, dto);
  }
}
