import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type {
  RentalTenantDetail,
  RentalTenantPage,
  RentalTenantSensitiveDetail,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { CreateTenantDto } from "./dto/create-tenant.dto.js";
import { DeleteTenantDto } from "./dto/delete-tenant.dto.js";
import { ListTenantsDto } from "./dto/list-tenants.dto.js";
import { RevealTenantSensitiveDto } from "./dto/reveal-tenant-sensitive.dto.js";
import { SetTenantStatusDto } from "./dto/set-tenant-status.dto.js";
import { TenantDetailDto } from "./dto/tenant-detail.dto.js";
import { UpdateTenantDto } from "./dto/update-tenant.dto.js";
import { TenantsService } from "./tenants.service.js";

/** 暴露租赁租户分页、详情、管理动作与受审计敏感查看接口。 */
@Controller("rental-tenants")
@UseGuards(AuthGuard, RbacGuard)
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get("list")
  @RequirePermission("rental_tenants:read")
  list(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: ListTenantsDto,
  ): Promise<RentalTenantPage> {
    return this.service.list(authContext, dto);
  }

  @Get("detail")
  @RequirePermission("rental_tenants:read")
  detail(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: TenantDetailDto,
  ): Promise<RentalTenantDetail> {
    return this.service.detail(authContext, dto);
  }

  @Post("create")
  @HttpCode(200)
  @RequirePermission("rental_tenants:create")
  create(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CreateTenantDto,
  ): Promise<RentalTenantDetail> {
    return this.service.create(authContext, dto);
  }

  @Post("update")
  @HttpCode(200)
  @RequirePermission("rental_tenants:update")
  update(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: UpdateTenantDto,
  ): Promise<RentalTenantDetail> {
    return this.service.update(authContext, dto);
  }

  @Post("set-status")
  @HttpCode(200)
  @RequirePermission("rental_tenants:update")
  setStatus(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: SetTenantStatusDto,
  ): Promise<RentalTenantDetail> {
    return this.service.setStatus(authContext, dto);
  }

  @Post("delete")
  @HttpCode(200)
  @RequirePermission("rental_tenants:delete")
  delete(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: DeleteTenantDto,
  ): Promise<void> {
    return this.service.delete(authContext, dto);
  }

  @Post("reveal-sensitive")
  @HttpCode(200)
  @RequirePermission(["rental_tenants:read", "rental_tenants:sensitive_read"])
  revealSensitive(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: RevealTenantSensitiveDto,
  ): Promise<RentalTenantSensitiveDetail> {
    return this.service.revealSensitive(authContext, dto);
  }
}
