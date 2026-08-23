import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type { CategoryNode } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { CategoriesService } from "./categories.service.js";
import { CreateCategoryDto } from "./dto/create-category.dto.js";
import { DeleteCategoryDto } from "./dto/delete-category.dto.js";
import { ListCategoriesDto } from "./dto/list-categories.dto.js";
import { UpdateCategoryDto } from "./dto/update-category.dto.js";

/** 暴露两级分类查询与管理接口。 */
@Controller("categories")
@UseGuards(AuthGuard, RbacGuard)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  /** 返回当前组织指定账本的两级分类树。 */
  @Get("list")
  @RequirePermission("categories:read")
  list(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: ListCategoriesDto,
  ): Promise<CategoryNode[]> {
    return this.service.list(authContext, dto);
  }

  /** 创建当前组织账本内的分类。 */
  @Post("create")
  @HttpCode(200)
  @RequirePermission("categories:create")
  create(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryNode> {
    return this.service.create(authContext, dto);
  }

  /** 更新当前组织内的活动分类。 */
  @Post("update")
  @HttpCode(200)
  @RequirePermission("categories:update")
  update(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryNode> {
    return this.service.update(authContext, dto);
  }

  /** 软删除当前组织内没有活动子级的分类。 */
  @Post("delete")
  @HttpCode(200)
  @RequirePermission("categories:delete")
  delete(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: DeleteCategoryDto,
  ): Promise<void> {
    return this.service.delete(authContext, dto);
  }
}
