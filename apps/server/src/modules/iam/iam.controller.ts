import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import type { PermissionTreeNode } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "./decorators/require-permission.decorator.js";
import { CreateMemberDto } from "./dto/create-member.dto.js";
import { CreateRoleDto } from "./dto/create-role.dto.js";
import { EditRoleDto } from "./dto/edit-role.dto.js";
import { EditRolePermissionsDto } from "./dto/edit-role-permissions.dto.js";
import { UpdateMemberDto } from "./dto/update-member.dto.js";
import { UpdateRoleDto } from "./dto/update-role.dto.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { RbacGuard } from "./guards/rbac.guard.js";
import { IamService } from "./iam.service.js";
import type { IamMember, IamPermission, IamRole, IamRoleWithPermissions } from "./iam.types.js";
import { PermissionTreeService } from "./permission-tree.service.js";

@Controller()
@UseGuards(AuthGuard, RbacGuard)
export class IamController {
  constructor(
    private readonly iamService: IamService,
    private readonly permissionTreeService: PermissionTreeService,
  ) {}

  @Get("members")
  @RequirePermission("members:read")
  listMembers(@CurrentAuthContext() authContext: AuthContext): Promise<IamMember[]> {
    return this.iamService.listMembers(authContext);
  }

  @Post("members")
  @RequirePermission("members:create")
  createMember(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CreateMemberDto,
  ): Promise<IamMember> {
    return this.iamService.createMember(authContext, dto);
  }

  @Patch("members/:memberId")
  updateMember(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("memberId") memberId: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<IamMember> {
    return this.iamService.updateMember(authContext, memberId, dto);
  }

  @Get("roles")
  @RequirePermission("roles:read")
  listRoles(@CurrentAuthContext() authContext: AuthContext): Promise<IamRoleWithPermissions[]> {
    return this.iamService.listRoles(authContext);
  }

  @Post("roles")
  @RequirePermission("roles:create")
  createRole(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CreateRoleDto,
  ): Promise<IamRole> {
    return this.iamService.createRole(authContext, dto);
  }

  @Patch("roles/:roleId")
  @RequirePermission("roles:update")
  updateRole(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("roleId") roleId: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<IamRole> {
    return this.iamService.updateRole(authContext, roleId, dto);
  }

  @Post("roles/edit")
  @RequirePermission("roles:update")
  editRole(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: EditRoleDto,
  ): Promise<IamRole> {
    return this.iamService.updateRole(authContext, dto.roleId, dto);
  }

  @Post("roles/permissions/edit")
  @RequirePermission("roles:permissions:update")
  editRolePermissions(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: EditRolePermissionsDto,
  ): Promise<void> {
    return this.permissionTreeService.editRolePermissions(authContext, dto);
  }

  @Delete("roles/:roleId")
  @RequirePermission("roles:delete")
  deleteRole(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("roleId") roleId: string,
  ): Promise<void> {
    return this.iamService.deleteRole(authContext, roleId);
  }

  @Get("permissions")
  @RequirePermission("permissions:read")
  listPermissions(@CurrentAuthContext() authContext: AuthContext): Promise<IamPermission[]> {
    return this.iamService.listPermissions(authContext);
  }

  @Get("permissions/tree")
  @RequirePermission("roles:permissions:update")
  getPermissionTree(@CurrentAuthContext() authContext: AuthContext): Promise<PermissionTreeNode[]> {
    return this.permissionTreeService.getPermissionTree(authContext);
  }
}
