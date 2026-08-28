import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type { RentalSpaceChildrenPage, RentalSpaceSearchPage } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { BatchCreateSpacesDto } from "./dto/batch-create-spaces.dto.js";
import { CreateSpaceDto } from "./dto/create-space.dto.js";
import { DeleteSpaceDto } from "./dto/delete-space.dto.js";
import { ListSpaceChildrenDto } from "./dto/list-space-children.dto.js";
import { MoveSpaceDto } from "./dto/move-space.dto.js";
import { SearchSpacesDto } from "./dto/search-spaces.dto.js";
import { SetSpaceStatusDto } from "./dto/set-space-status.dto.js";
import { UpdateSpaceDto } from "./dto/update-space.dto.js";
import {
  type RentalSpaceBatchMutationResult,
  type RentalSpaceMutationResult,
  SpacesService,
} from "./spaces.service.js";

/** 暴露租赁空间懒加载、搜索和树管理动作接口。 */
@Controller("rental-spaces")
@UseGuards(AuthGuard, RbacGuard)
export class SpacesController {
  constructor(private readonly service: SpacesService) {}

  @Get("children")
  @RequirePermission("rental_spaces:read")
  listChildren(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: ListSpaceChildrenDto,
  ): Promise<RentalSpaceChildrenPage> {
    return this.service.listChildren(authContext, dto);
  }

  @Get("search")
  @RequirePermission("rental_spaces:read")
  search(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: SearchSpacesDto,
  ): Promise<RentalSpaceSearchPage> {
    return this.service.search(authContext, dto);
  }

  @Post("create")
  @HttpCode(200)
  @RequirePermission("rental_spaces:create")
  create(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CreateSpaceDto,
  ): Promise<RentalSpaceMutationResult> {
    return this.service.create(authContext, dto);
  }

  @Post("batch-create")
  @HttpCode(200)
  @RequirePermission("rental_spaces:create")
  batchCreate(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: BatchCreateSpacesDto,
  ): Promise<RentalSpaceBatchMutationResult> {
    return this.service.batchCreate(authContext, dto);
  }

  @Post("update")
  @HttpCode(200)
  @RequirePermission("rental_spaces:update")
  update(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: UpdateSpaceDto,
  ): Promise<RentalSpaceMutationResult> {
    return this.service.update(authContext, dto);
  }

  @Post("move")
  @HttpCode(200)
  @RequirePermission("rental_spaces:update")
  move(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: MoveSpaceDto,
  ): Promise<RentalSpaceMutationResult> {
    return this.service.move(authContext, dto);
  }

  @Post("set-status")
  @HttpCode(200)
  @RequirePermission("rental_spaces:update")
  setStatus(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: SetSpaceStatusDto,
  ): Promise<RentalSpaceMutationResult> {
    return this.service.setStatus(authContext, dto);
  }

  @Post("delete")
  @HttpCode(200)
  @RequirePermission("rental_spaces:delete")
  delete(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: DeleteSpaceDto,
  ): Promise<void> {
    return this.service.delete(authContext, dto);
  }
}
