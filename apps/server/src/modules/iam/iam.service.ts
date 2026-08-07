import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "./access.service.js";
import type { CreateMemberDto } from "./dto/create-member.dto.js";
import type { CreateRoleDto } from "./dto/create-role.dto.js";
import type { UpdateMemberDto } from "./dto/update-member.dto.js";
import type { UpdateRoleDto } from "./dto/update-role.dto.js";
import { IamRepository } from "./iam.repository.js";
import type { IamMember, IamPermission, IamRole, IamRoleWithPermissions } from "./iam.types.js";

@Injectable()
export class IamService {
  constructor(
    private readonly repository: IamRepository,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
    private readonly accessService: AccessService,
  ) {}

  listMembers(authContext: AuthContext): Promise<IamMember[]> {
    return this.repository.listMembers(authContext.organizationId);
  }

  async createMember(authContext: AuthContext, dto: CreateMemberDto): Promise<IamMember> {
    const existingMember = await this.repository.findMemberByOrganizationAndUser(
      authContext.organizationId,
      dto.userId,
    );

    if (existingMember) {
      throw this.conflict("用户已属于当前组织");
    }

    await this.ensureRoleInCurrentOrganization(authContext.organizationId, dto.roleId);
    await this.assertRoleWithinPermissionCeiling(authContext, dto.roleId);

    return this.transactions.run(async (transaction) => {
      const member = await this.repository.createMember(
        {
          organizationId: authContext.organizationId,
          userId: dto.userId,
          roleId: dto.roleId,
          status: "active",
        },
        transaction,
      );

      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "member.created",
          targetType: "member",
          targetId: member.id,
          result: "succeeded",
          metadata: {
            userId: dto.userId,
            roleTo: dto.roleId,
          },
        },
        transaction,
      );

      return member;
    });
  }

  async updateMember(
    authContext: AuthContext,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<IamMember> {
    if (dto.roleId !== undefined) {
      this.accessService.assertPermission(authContext, "members:update");
    }

    if (dto.status === "active") {
      this.accessService.assertPermission(authContext, "members:enable");
    }

    if (dto.status === "disabled") {
      this.accessService.assertPermission(authContext, "members:disable");
    }

    if (dto.roleId) {
      await this.ensureRoleInCurrentOrganization(authContext.organizationId, dto.roleId);
      await this.assertRoleWithinPermissionCeiling(authContext, dto.roleId);
    }

    return this.transactions.run(async (transaction) => {
      const member = await this.repository.findMemberById(
        authContext.organizationId,
        memberId,
        transaction,
        true,
      );

      if (!member) {
        throw this.notFound("组织成员不存在");
      }

      const updatedMember = await this.repository.updateMember(
        {
          organizationId: authContext.organizationId,
          memberId,
          roleId: dto.roleId,
          status: dto.status,
        },
        transaction,
      );

      if (member.status === "active" && dto.status === "disabled") {
        await this.repository.revokeActiveSessionsForUserInOrganization(
          member.userId,
          authContext.organizationId,
          transaction,
        );
      }

      if (dto.roleId && dto.roleId !== member.roleId) {
        await this.auditService.appendRequired(
          {
            organizationId: authContext.organizationId,
            actorUserId: authContext.userId,
            action: "member.role.changed",
            targetType: "member",
            targetId: memberId,
            result: "succeeded",
            metadata: {
              userId: member.userId,
              roleFrom: member.roleId,
              roleTo: dto.roleId,
            },
          },
          transaction,
        );
      }

      if (member.status !== dto.status && dto.status === "disabled") {
        await this.auditService.appendRequired(
          {
            organizationId: authContext.organizationId,
            actorUserId: authContext.userId,
            action: "member.disabled",
            targetType: "member",
            targetId: memberId,
            result: "succeeded",
            metadata: {
              userId: member.userId,
            },
          },
          transaction,
        );
      }

      if (member.status !== dto.status && dto.status === "active") {
        await this.auditService.appendRequired(
          {
            organizationId: authContext.organizationId,
            actorUserId: authContext.userId,
            action: "member.enabled",
            targetType: "member",
            targetId: memberId,
            result: "succeeded",
            metadata: {
              userId: member.userId,
            },
          },
          transaction,
        );
      }

      return updatedMember;
    });
  }

  listRoles(authContext: AuthContext): Promise<IamRoleWithPermissions[]> {
    return this.repository.listRoles(authContext.organizationId);
  }

  async createRole(authContext: AuthContext, dto: CreateRoleDto): Promise<IamRole> {
    if (dto.permissionKeys.length > 0) {
      this.assertCanUpdateRolePermissions(authContext);
      this.assertPermissionsWithinCeiling(authContext, dto.permissionKeys);
    }

    const existingRole = await this.repository.findRoleByKey(authContext.organizationId, dto.key);

    if (existingRole) {
      throw this.conflict("角色标识在当前组织已存在");
    }

    return this.transactions.run(async (transaction) => {
      const role = await this.repository.createRole(
        {
          organizationId: authContext.organizationId,
          key: dto.key,
          name: dto.name,
          description: dto.description,
        },
        transaction,
      );

      await this.repository.replaceRolePermissions(
        {
          roleId: role.id,
          permissionKeys: dto.permissionKeys,
        },
        transaction,
      );

      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "role.created",
          targetType: "role",
          targetId: role.id,
          result: "succeeded",
          metadata: {
            key: dto.key,
          },
        },
        transaction,
      );

      if (dto.permissionKeys.length > 0) {
        await this.auditService.appendRequired(
          {
            organizationId: authContext.organizationId,
            actorUserId: authContext.userId,
            action: "role.permissions.changed",
            targetType: "role",
            targetId: role.id,
            result: "succeeded",
            metadata: {
              permissionKeys: dto.permissionKeys,
            },
          },
          transaction,
        );
      }

      return role;
    });
  }

  async updateRole(authContext: AuthContext, roleId: string, dto: UpdateRoleDto): Promise<IamRole> {
    if (dto.permissionKeys !== undefined) {
      this.assertCanUpdateRolePermissions(authContext);
      this.assertPermissionsWithinCeiling(authContext, dto.permissionKeys);
    }

    const role = await this.repository.findRoleById(authContext.organizationId, roleId);

    if (!role) {
      throw this.notFound("角色不存在");
    }

    this.assertRoleEditable(role);

    return this.transactions.run(async (transaction) => {
      const updatedRole = await this.repository.updateRole(
        {
          organizationId: authContext.organizationId,
          roleId,
          name: dto.name,
          description: dto.description,
        },
        transaction,
      );

      if (dto.permissionKeys) {
        await this.repository.replaceRolePermissions(
          {
            roleId,
            permissionKeys: dto.permissionKeys,
          },
          transaction,
        );
      }

      if (dto.name !== undefined || dto.description !== undefined) {
        await this.auditService.appendRequired(
          {
            organizationId: authContext.organizationId,
            actorUserId: authContext.userId,
            action: "role.updated",
            targetType: "role",
            targetId: roleId,
            result: "succeeded",
            metadata: {
              nameFrom: role.name,
              nameTo: dto.name,
              descriptionFrom: role.description,
              descriptionTo: dto.description,
            },
          },
          transaction,
        );
      }

      if (dto.permissionKeys) {
        await this.auditService.appendRequired(
          {
            organizationId: authContext.organizationId,
            actorUserId: authContext.userId,
            action: "role.permissions.changed",
            targetType: "role",
            targetId: roleId,
            result: "succeeded",
            metadata: {
              permissionKeys: dto.permissionKeys,
            },
          },
          transaction,
        );
      }

      return updatedRole;
    });
  }

  async deleteRole(authContext: AuthContext, roleId: string): Promise<void> {
    const role = await this.repository.findRoleById(authContext.organizationId, roleId);

    if (!role) {
      throw this.notFound("角色不存在");
    }

    this.assertRoleEditable(role);

    const assignedMemberCount = await this.repository.countMembersUsingRole(
      authContext.organizationId,
      roleId,
    );

    if (assignedMemberCount > 0) {
      throw this.conflict("角色已被组织成员使用");
    }

    await this.transactions.run(async (transaction) => {
      await this.repository.deleteRole(authContext.organizationId, roleId, transaction);
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "role.deleted",
          targetType: "role",
          targetId: roleId,
          result: "succeeded",
          metadata: {
            key: role.key,
          },
        },
        transaction,
      );
    });
  }

  listPermissions(_authContext: AuthContext): Promise<IamPermission[]> {
    return this.repository.listPermissions();
  }

  private async ensureRoleInCurrentOrganization(
    organizationId: string,
    roleId: string,
  ): Promise<IamRole> {
    const role = await this.repository.findRoleById(organizationId, roleId);

    if (!role) {
      throw this.notFound("角色不存在");
    }

    return role;
  }

  private assertRoleEditable(role: IamRole): void {
    if (role.isSystem && !role.isEditable) {
      throw new ForbiddenException({
        code: apiErrorCodes.forbidden,
        message: "系统角色受保护",
      });
    }
  }

  private assertCanUpdateRolePermissions(authContext: AuthContext): void {
    if (
      !authContext.isSuperAdmin &&
      !authContext.permissions.includes("roles:permissions:update")
    ) {
      throw new ForbiddenException({
        code: apiErrorCodes.forbidden,
        message: "无权更新角色权限",
      });
    }
  }

  private async assertRoleWithinPermissionCeiling(
    authContext: AuthContext,
    roleId: string,
  ): Promise<void> {
    if (authContext.isSuperAdmin) {
      return;
    }

    const permissionKeys = await this.repository.listPermissionKeysForRole(roleId);
    this.assertPermissionsWithinCeiling(authContext, permissionKeys);
  }

  private assertPermissionsWithinCeiling(
    authContext: AuthContext,
    permissionKeys: readonly PermissionKey[],
  ): void {
    if (
      authContext.isSuperAdmin ||
      permissionKeys.every((permissionKey) => authContext.permissions.includes(permissionKey))
    ) {
      return;
    }

    throw new ForbiddenException({
      code: apiErrorCodes.forbidden,
      message: "不能授予超出自身权限范围的权限",
    });
  }

  private conflict(message: string): ConflictException {
    return new ConflictException({
      code: apiErrorCodes.conflict,
      message,
    });
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({
      code: apiErrorCodes.notFound,
      message,
    });
  }
}
