import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import type { AuthTokensResponse } from "@xpense/shared";
import { CurrentSessionContext } from "../../common/auth/current-session-context.decorator.js";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { SessionAuthGuard } from "../iam/guards/session-auth.guard.js";
import {
  type SwitchOrganizationDto,
  switchOrganizationSchema,
} from "./dto/switch-organization.dto.js";
import type { UserOrganization } from "./organizations.repository.js";
import { OrganizationsService } from "./organizations.service.js";

@Controller("user")
@UseGuards(SessionAuthGuard, RbacGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get("organizations")
  listOrganizations(
    @CurrentSessionContext() authContext: SessionAuthContext,
  ): Promise<UserOrganization[]> {
    return this.organizationsService.listOrganizations(authContext);
  }

  @Post("current-organization")
  @HttpCode(200)
  switchCurrentOrganization(
    @CurrentSessionContext() authContext: SessionAuthContext,
    @Body({ schema: switchOrganizationSchema }) dto: SwitchOrganizationDto,
  ): Promise<AuthTokensResponse> {
    return this.organizationsService.switchCurrentOrganization(authContext, dto.organizationId);
  }
}
