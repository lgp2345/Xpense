import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type { RentalPropertyDetail, RentalPropertyPage } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { CreatePropertyDto } from "./dto/create-property.dto.js";
import { DeletePropertyDto } from "./dto/delete-property.dto.js";
import { ListPropertiesDto } from "./dto/list-properties.dto.js";
import { PropertyDetailDto } from "./dto/property-detail.dto.js";
import { SetPropertyStatusDto } from "./dto/set-property-status.dto.js";
import { UpdatePropertyDto } from "./dto/update-property.dto.js";
import { PropertiesService } from "./properties.service.js";

/** 暴露租赁房产分页、详情及管理动作接口。 */
@Controller("rental-properties")
@UseGuards(AuthGuard, RbacGuard)
export class PropertiesController {
  constructor(private readonly service: PropertiesService) {}

  /** 返回当前组织内的房产分页摘要。 */
  @Get("list")
  @RequirePermission("rental_properties:read")
  list(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: ListPropertiesDto,
  ): Promise<RentalPropertyPage> {
    return this.service.list(authContext, dto);
  }

  /** 返回当前组织内的房产详情。 */
  @Get("detail")
  @RequirePermission("rental_properties:read")
  detail(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: PropertyDetailDto,
  ): Promise<RentalPropertyDetail> {
    return this.service.detail(authContext, dto);
  }

  /** 创建房产及服务端生成的伴生租赁账本。 */
  @Post("create")
  @HttpCode(200)
  @RequirePermission("rental_properties:create")
  create(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CreatePropertyDto,
  ): Promise<RentalPropertyDetail> {
    return this.service.create(authContext, dto);
  }

  /** 更新房产资料并按需同步账本名称。 */
  @Post("update")
  @HttpCode(200)
  @RequirePermission("rental_properties:update")
  update(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: UpdatePropertyDto,
  ): Promise<RentalPropertyDetail> {
    return this.service.update(authContext, dto);
  }

  /** 只改变房产自身启停状态。 */
  @Post("set-status")
  @HttpCode(200)
  @RequirePermission("rental_properties:update")
  setStatus(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: SetPropertyStatusDto,
  ): Promise<RentalPropertyDetail> {
    return this.service.setStatus(authContext, dto);
  }

  /** 软删除没有活动空间或账务历史的房产。 */
  @Post("delete")
  @HttpCode(200)
  @RequirePermission("rental_properties:delete")
  delete(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: DeletePropertyDto,
  ): Promise<void> {
    return this.service.delete(authContext, dto);
  }
}
