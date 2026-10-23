import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CurrentSessionContext } from "../../common/auth/current-session-context.decorator.js";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import {
  type ResetOrganizationMenusDto,
  resetOrganizationMenusSchema,
} from "./dto/reset-organization-menus.dto.js";
import { SessionAuthGuard } from "./guards/session-auth.guard.js";
import { MenuService } from "./menu.service.js";
@Controller("organizations/menus")
@UseGuards(SessionAuthGuard)
export class MenuPlatformController {
  constructor(private readonly service: MenuService) {}
  @Post("reset")
  @HttpCode(200)
  reset(
    @CurrentSessionContext() ctx: SessionAuthContext,
    @Body({ schema: resetOrganizationMenusSchema }) input: ResetOrganizationMenusDto,
  ): Promise<void> {
    return this.service.resetOrganizationMenus(ctx, input);
  }
}
