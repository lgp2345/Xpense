import { Body, Controller, Dependencies, Get, Post } from "@nestjs/common";
import type { AuthTokensResponse } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
// biome-ignore lint/style/useImportType: Nest needs DTO classes at runtime for validation metadata.
import { SwitchOrganizationDto } from "./dto/switch-organization.dto.js";
import type { UserOrganization } from "./organizations.repository.js";
import { OrganizationsService } from "./organizations.service.js";

@Controller("user")
@Dependencies(OrganizationsService)
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
