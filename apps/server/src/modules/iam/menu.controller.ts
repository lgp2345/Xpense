import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type { AuthorizedMenuNode, MenuConfigurationNode } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "./decorators/require-permission.decorator.js";
import { AddMenuDto } from "./dto/add-menu.dto.js";
import { DeleteMenuDto } from "./dto/delete-menu.dto.js";
import { EditMenuDto } from "./dto/edit-menu.dto.js";
import { EditMenuOrderDto } from "./dto/edit-menu-order.dto.js";
import { ResetOrganizationMenusDto } from "./dto/reset-organization-menus.dto.js";
import { ResolveMenuDto } from "./dto/resolve-menu.dto.js";
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
    @Query() dto: ResolveMenuDto,
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
  @RequirePermission("menus:create")
  addMenu(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: AddMenuDto,
  ): Promise<MenuRow> {
    return this.menuService.addMenu(authContext, dto);
  }

  @Post("menus/edit")
  @RequirePermission("menus:update")
  editMenu(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: EditMenuDto,
  ): Promise<MenuRow> {
    return this.menuService.editMenu(authContext, dto);
  }

  @Post("menus/delete")
  @RequirePermission("menus:delete")
  deleteMenu(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: DeleteMenuDto,
  ): Promise<void> {
    return this.menuService.deleteMenu(authContext, dto);
  }

  @Post("menus/edit-order")
  @RequirePermission("menus:update")
  editMenuOrder(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: EditMenuOrderDto,
  ): Promise<void> {
    return this.menuService.editMenuOrder(authContext, dto);
  }

  @Post("organizations/menus/reset")
  resetOrganizationMenus(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: ResetOrganizationMenusDto,
  ): Promise<void> {
    return this.menuService.resetOrganizationMenus(authContext, dto);
  }
}
