import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import {
  type UpdateOrganizationProfileDto,
  updateOrganizationProfileSchema,
} from "./dto/update-organization-profile.dto.js";
import { OrganizationSettingsService } from "./organization-settings.service.js";

@Controller("organizations/settings")
@UseGuards(AuthGuard)
export class OrganizationSettingsController {
  constructor(private readonly service: OrganizationSettingsService) {}
  @Get("detail")
  get(@CurrentAuthContext() ctx: AuthContext) {
    return this.service.get(ctx);
  }
  @Post("update")
  @HttpCode(200)
  update(
    @CurrentAuthContext() ctx: AuthContext,
    @Body({ schema: updateOrganizationProfileSchema }) input: UpdateOrganizationProfileDto,
  ) {
    return this.service.update(ctx, input);
  }
}
