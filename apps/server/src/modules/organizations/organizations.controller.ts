import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import type { AuthTokensResponse } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { SwitchOrganizationDto } from "./dto/switch-organization.dto.js";
import type { UserOrganization } from "./organizations.repository.js";
import { OrganizationsService } from "./organizations.service.js";

@Controller("user")
@UseGuards(AuthGuard, RbacGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get("organizations")
  listOrganizations(@CurrentAuthContext() authContext: AuthContext): Promise<UserOrganization[]> {
    return this.organizationsService.listOrganizations(authContext);
  }

  @Post("current-organization")
  switchCurrentOrganization(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: SwitchOrganizationDto,
  ): Promise<AuthTokensResponse> {
    return this.organizationsService.switchCurrentOrganization(authContext, dto.organizationId);
  }
}
