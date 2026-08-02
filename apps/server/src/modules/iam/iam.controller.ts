import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "./decorators/require-permission.decorator.js";
import { CreateMemberDto } from "./dto/create-member.dto.js";
import { CreateRoleDto } from "./dto/create-role.dto.js";
import { UpdateMemberDto } from "./dto/update-member.dto.js";
import { UpdateRoleDto } from "./dto/update-role.dto.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { RbacGuard } from "./guards/rbac.guard.js";
import { IamService } from "./iam.service.js";
import type { IamMember, IamPermission, IamRole, IamRoleWithPermissions } from "./iam.types.js";

@Controller()
@UseGuards(AuthGuard, RbacGuard)
export class IamController {
  constructor(private readonly iamService: IamService) {}

  @Get("members")
  @RequirePermission("members.read")
  listMembers(@CurrentAuthContext() authContext: AuthContext): Promise<IamMember[]> {
    return this.iamService.listMembers(authContext);
  }

  @Post("members")
  @RequirePermission("members.create")
  createMember(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CreateMemberDto,
  ): Promise<IamMember> {
    return this.iamService.createMember(authContext, dto);
  }

  @Patch("members/:memberId")
  @RequirePermission("members.update")
  updateMember(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("memberId") memberId: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<IamMember> {
    return this.iamService.updateMember(authContext, memberId, dto);
  }

  @Get("roles")
  @RequirePermission("roles.read")
  listRoles(@CurrentAuthContext() authContext: AuthContext): Promise<IamRoleWithPermissions[]> {
    return this.iamService.listRoles(authContext);
  }

  @Post("roles")
  @RequirePermission("roles.create")
  createRole(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CreateRoleDto,
  ): Promise<IamRole> {
    return this.iamService.createRole(authContext, dto);
  }

  @Patch("roles/:roleId")
  @RequirePermission("roles.update")
  updateRole(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("roleId") roleId: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<IamRole> {
    return this.iamService.updateRole(authContext, roleId, dto);
  }

  @Delete("roles/:roleId")
  @RequirePermission("roles.delete")
  deleteRole(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("roleId") roleId: string,
  ): Promise<void> {
    return this.iamService.deleteRole(authContext, roleId);
  }

  @Get("permissions")
  @RequirePermission("permissions.read")
  listPermissions(@CurrentAuthContext() authContext: AuthContext): Promise<IamPermission[]> {
    return this.iamService.listPermissions(authContext);
  }
}
