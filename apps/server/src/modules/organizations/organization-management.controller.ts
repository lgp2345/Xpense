import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentSessionContext } from "../../common/auth/current-session-context.decorator.js";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { SessionAuthGuard } from "../iam/guards/session-auth.guard.js";
import {
  type CreateOrganizationDto,
  createOrganizationSchema,
} from "./dto/create-organization.dto.js";
import {
  type ListOrganizationsDto,
  listOrganizationsSchema,
} from "./dto/list-organizations.dto.js";
import {
  type OrganizationDetailQuery,
  type OrganizationOwnerQuery,
  organizationDetailQuerySchema,
  organizationOwnerQuerySchema,
} from "./dto/organization-query.dto.js";
import { OrganizationManagementService } from "./organization-management.service.js";

@Controller("organizations")
@UseGuards(SessionAuthGuard)
export class OrganizationManagementController {
  constructor(private readonly service: OrganizationManagementService) {}
  @Get("list")
  list(
    @CurrentSessionContext() ctx: SessionAuthContext,
    @Query({ schema: listOrganizationsSchema }) input: ListOrganizationsDto,
  ) {
    return this.service.list(ctx, input);
  }
  @Get("detail")
  detail(
    @CurrentSessionContext() ctx: SessionAuthContext,
    @Query({ schema: organizationDetailQuerySchema }) input: OrganizationDetailQuery,
  ) {
    return this.service.detail(ctx, input.id);
  }
  @Get("owner-candidates/list")
  resolveOwner(
    @CurrentSessionContext() ctx: SessionAuthContext,
    @Query({ schema: organizationOwnerQuerySchema }) input: OrganizationOwnerQuery,
  ) {
    return this.service.resolveOwner(ctx, input.phone);
  }
  @Post("create")
  @HttpCode(200)
  create(
    @CurrentSessionContext() ctx: SessionAuthContext,
    @Body({ schema: createOrganizationSchema }) input: CreateOrganizationDto,
  ) {
    return this.service.create(ctx, input);
  }
}
