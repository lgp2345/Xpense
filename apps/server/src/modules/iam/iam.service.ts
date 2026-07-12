import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { AuditService } from "../audit/audit.service.js";
import type { CreateMemberDto } from "./dto/create-member.dto.js";
import type { CreateRoleDto } from "./dto/create-role.dto.js";
import type { UpdateMemberDto } from "./dto/update-member.dto.js";
import type { UpdateRoleDto } from "./dto/update-role.dto.js";
import { IamRepository } from "./iam.repository.js";
import type { IamMember, IamPermission, IamRole } from "./iam.types.js";

@Injectable()
export class IamService {
  constructor(
    private readonly repository: IamRepository,
    private readonly auditService: AuditService,
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
      throw this.conflict("User is already a member of the current organization");
    }

    await this.ensureRoleInCurrentOrganization(authContext.organizationId, dto.roleId);

    const member = await this.repository.createMember({
      organizationId: authContext.organizationId,
      userId: dto.userId,
      roleId: dto.roleId,
      status: "active",
    });

    await this.auditService.appendRequired({
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
    });

    return member;
  }

  async updateMember(
    authContext: AuthContext,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<IamMember> {
    const member = await this.repository.findMemberById(authContext.organizationId, memberId);

    if (!member) {
      throw this.notFound("Organization member was not found");
    }

    if (dto.roleId) {
      await this.ensureRoleInCurrentOrganization(authContext.organizationId, dto.roleId);
    }

    const updatedMember = await this.repository.updateMember({
      organizationId: authContext.organizationId,
      memberId,
      roleId: dto.roleId,
      status: dto.status,
    });

    if (member.status === "active" && dto.status === "disabled") {
      await this.repository.revokeActiveSessionsForUserInOrganization(
        member.userId,
        authContext.organizationId,
      );
    }

    if (dto.roleId && dto.roleId !== member.roleId) {
      await this.auditService.appendRequired({
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
      });
    }

    if (member.status !== dto.status && dto.status === "disabled") {
      await this.auditService.appendRequired({
        organizationId: authContext.organizationId,
        actorUserId: authContext.userId,
        action: "member.disabled",
        targetType: "member",
        targetId: memberId,
        result: "succeeded",
        metadata: {
          userId: member.userId,
        },
      });
    }

    if (member.status !== dto.status && dto.status === "active") {
      await this.auditService.appendRequired({
        organizationId: authContext.organizationId,
        actorUserId: authContext.userId,
        action: "member.enabled",
        targetType: "member",
        targetId: memberId,
        result: "succeeded",
        metadata: {
          userId: member.userId,
        },
      });
    }

    return updatedMember;
  }

  listRoles(authContext: AuthContext): Promise<IamRole[]> {
    return this.repository.listRoles(authContext.organizationId);
  }

  async createRole(authContext: AuthContext, dto: CreateRoleDto): Promise<IamRole> {
    const existingRole = await this.repository.findRoleByKey(authContext.organizationId, dto.key);

    if (existingRole) {
      throw this.conflict("Role key already exists in the current organization");
    }

    const role = await this.repository.createRole({
      organizationId: authContext.organizationId,
      key: dto.key,
      name: dto.name,
      description: dto.description,
    });

    await this.repository.replaceRolePermissions({
      roleId: role.id,
      permissionKeys: dto.permissionKeys,
    });

    await this.auditService.appendRequired({
      organizationId: authContext.organizationId,
      actorUserId: authContext.userId,
      action: "role.created",
      targetType: "role",
      targetId: role.id,
      result: "succeeded",
      metadata: {
        key: dto.key,
      },
    });

    if (dto.permissionKeys.length > 0) {
      await this.auditService.appendRequired({
        organizationId: authContext.organizationId,
        actorUserId: authContext.userId,
        action: "role.permissions.changed",
        targetType: "role",
        targetId: role.id,
        result: "succeeded",
        metadata: {
          permissionKeys: dto.permissionKeys,
        },
      });
    }

    return role;
  }

  async updateRole(authContext: AuthContext, roleId: string, dto: UpdateRoleDto): Promise<IamRole> {
    const role = await this.repository.findRoleById(authContext.organizationId, roleId);

    if (!role) {
      throw this.notFound("Role was not found");
    }

    this.assertRoleEditable(role);

    const updatedRole = await this.repository.updateRole({
      organizationId: authContext.organizationId,
      roleId,
      name: dto.name,
      description: dto.description,
    });

    if (dto.permissionKeys) {
      await this.repository.replaceRolePermissions({
        roleId,
        permissionKeys: dto.permissionKeys,
      });
    }

    if (dto.name !== undefined || dto.description !== undefined) {
      await this.auditService.appendRequired({
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
      });
    }

    if (dto.permissionKeys) {
      await this.auditService.appendRequired({
        organizationId: authContext.organizationId,
        actorUserId: authContext.userId,
        action: "role.permissions.changed",
        targetType: "role",
        targetId: roleId,
        result: "succeeded",
        metadata: {
          permissionKeys: dto.permissionKeys,
        },
      });
    }

    return updatedRole;
  }

  async deleteRole(authContext: AuthContext, roleId: string): Promise<void> {
    const role = await this.repository.findRoleById(authContext.organizationId, roleId);

    if (!role) {
      throw this.notFound("Role was not found");
    }

    this.assertRoleEditable(role);

    const assignedMemberCount = await this.repository.countMembersUsingRole(
      authContext.organizationId,
      roleId,
    );

    if (assignedMemberCount > 0) {
      throw this.conflict("Role is assigned to organization members");
    }

    await this.repository.deleteRole(authContext.organizationId, roleId);
    await this.auditService.appendRequired({
      organizationId: authContext.organizationId,
      actorUserId: authContext.userId,
      action: "role.deleted",
      targetType: "role",
      targetId: roleId,
      result: "succeeded",
      metadata: {
        key: role.key,
      },
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
      throw this.notFound("Role was not found");
    }

    return role;
  }

  private assertRoleEditable(role: IamRole): void {
    if (role.isSystem && !role.isEditable) {
      throw new ForbiddenException({
        code: apiErrorCodes.forbidden,
        message: "System role is protected",
      });
    }
  }

  private conflict(message: string): ConflictException {
    return new ConflictException({
      code: apiErrorCodes.conflict,
      message,
    });
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({
      code: "NOT_FOUND",
      message,
    });
  }
}
