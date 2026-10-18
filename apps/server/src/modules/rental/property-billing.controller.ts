import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { rentalPropertyBillingPermissions } from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import {
  type ListPropertyBillingDto,
  listPropertyBillingSchema,
} from "./dto/list-property-billing.dto.js";
import { PropertyBillingService } from "./property-billing.service.js";
@Controller("rental-period-bills")
@UseGuards(AuthGuard, RbacGuard)
export class PropertyBillingController {
  constructor(private readonly service: PropertyBillingService) {}
  @Get("list")
  @RequirePermission([...rentalPropertyBillingPermissions])
  list(
    @CurrentAuthContext() auth: AuthContext,
    @Query({ schema: listPropertyBillingSchema }) dto: ListPropertyBillingDto,
  ) {
    return this.service.list(auth, dto);
  }
}
