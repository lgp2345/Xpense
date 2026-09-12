import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type { AuthorizedMenuNode, MenuConfigurationNode } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "./decorators/require-permission.decorator.js";
import { type AddMenuDto, addMenuSchema } from "./dto/add-menu.dto.js";
import { type DeleteMenuDto, deleteMenuSchema } from "./dto/delete-menu.dto.js";
import { type EditMenuDto, editMenuSchema } from "./dto/edit-menu.dto.js";
import { type EditMenuOrderDto, editMenuOrderSchema } from "./dto/edit-menu-order.dto.js";
import {
  type ResetOrganizationMenusDto,
  resetOrganizationMenusSchema,
} from "./dto/reset-organization-menus.dto.js";
import { type ResolveMenuDto, resolveMenuSchema } from "./dto/resolve-menu.dto.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { RbacGuard } from "./guards/rbac.guard.js";
import type { MenuRow } from "./menu.repository.js";
import { MenuService } from "./menu.service.js";

@Controller()
@UseGuards(AuthGuard, RbacGuard)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get("menus/resolve")
  resolveRoute(
    @CurrentAuthContext() authContext: AuthContext,
    @Query({ schema: resolveMenuSchema }) dto: ResolveMenuDto,
  ): Promise<AuthorizedMenuNode> {
    return this.menuService.resolveRoute(authContext, dto.path);
  }

  @Get("menus/configuration")
  @RequirePermission("menus:read")
  getConfiguration(
    @CurrentAuthContext() authContext: AuthContext,
  ): Promise<MenuConfigurationNode[]> {
    return this.menuService.getConfiguration(authContext);
  }

  @Get("menus")
  getAuthorizedMenus(
    @CurrentAuthContext() authContext: AuthContext,
  ): Promise<AuthorizedMenuNode[]> {
    return this.menuService.getAuthorizedMenus(authContext);
  }

  @Post("menus/add")
  @HttpCode(200)
  @RequirePermission("menus:create")
  addMenu(
    @CurrentAuthContext() authContext: AuthContext,
    @Body({ schema: addMenuSchema }) dto: AddMenuDto,
  ): Promise<MenuRow> {
    return this.menuService.addMenu(authContext, dto);
  }

  @Post("menus/edit")
  @HttpCode(200)
  @RequirePermission("menus:update")
  editMenu(
    @CurrentAuthContext() authContext: AuthContext,
    @Body({ schema: editMenuSchema }) dto: EditMenuDto,
  ): Promise<MenuRow> {
    return this.menuService.editMenu(authContext, dto);
  }

  @Post("menus/delete")
  @HttpCode(200)
  @RequirePermission("menus:delete")
  deleteMenu(
    @CurrentAuthContext() authContext: AuthContext,
    @Body({ schema: deleteMenuSchema }) dto: DeleteMenuDto,
  ): Promise<void> {
    return this.menuService.deleteMenu(authContext, dto);
  }

  @Post("menus/edit-order")
  @HttpCode(200)
  @RequirePermission("menus:update")
  editMenuOrder(
    @CurrentAuthContext() authContext: AuthContext,
    @Body({ schema: editMenuOrderSchema }) dto: EditMenuOrderDto,
  ): Promise<void> {
    return this.menuService.editMenuOrder(authContext, dto);
  }

  @Post("organizations/menus/reset")
  @HttpCode(200)
  resetOrganizationMenus(
    @CurrentAuthContext() authContext: AuthContext,
    @Body({ schema: resetOrganizationMenusSchema }) dto: ResetOrganizationMenusDto,
  ): Promise<void> {
    return this.menuService.resetOrganizationMenus(authContext, dto);
  }
}
