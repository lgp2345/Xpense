import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PermissionTreeNode } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { EditRolePermissionsDto } from "./dto/edit-role-permissions.dto.js";
import { IamRepository } from "./iam.repository.js";
import { MenuRepository } from "./menu.repository.js";
import {
  buildPermissionTree,
  completePermissionSelection,
  findMissingAncestorPermissions,
} from "./permission-tree.js";

@Injectable()
export class PermissionTreeService {
  constructor(
    private readonly repository: IamRepository,
    private readonly menuRepository: MenuRepository,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async getPermissionTree(authContext: AuthContext): Promise<PermissionTreeNode[]> {
    const [rows, permissions] = await Promise.all([
      this.menuRepository.listByOrganizationId(authContext.organizationId),
      this.repository.listPermissions(),
    ]);
    const withinCeiling = authContext.isSuperAdmin
      ? permissions
      : permissions.filter((permission) => authContext.permissions.includes(permission.key));
    const manageableCodes = new Set(withinCeiling.map((permission) => permission.key));
    const manageablePermissions = withinCeiling.filter((permission) =>
      completePermissionSelection(rows, [permission.key]).every((required) =>
        manageableCodes.has(required),
      ),
    );

    return buildPermissionTree(rows, manageablePermissions);
  }

  async editRolePermissions(authContext: AuthContext, dto: EditRolePermissionsDto): Promise<void> {
    this.assertCanUpdateRolePermissions(authContext);

    const [rows, permissions] = await Promise.all([
      this.menuRepository.listByOrganizationId(authContext.organizationId),
      this.repository.listPermissions(),
    ]);
    const knownPermissionCodes = new Set(permissions.map((permission) => permission.key));
    const requested = [...new Set(dto.permissionKeys)].toSorted();
    const unknown = requested.filter((permissionCode) => !knownPermissionCodes.has(permissionCode));

    if (unknown.length > 0) {
      throw this.badRequest("请求包含不存在的权限");
    }

    const manageable = new Set(
      authContext.isSuperAdmin
        ? permissions.map((permission) => permission.key)
        : authContext.permissions,
    );

    if (requested.some((permissionCode) => !manageable.has(permissionCode))) {
      throw new ForbiddenException({
        code: apiErrorCodes.forbidden,
        message: "不能授予超出自身权限范围的权限",
      });
    }

    if (findMissingAncestorPermissions(rows, requested).length > 0) {
      throw this.badRequest("请求权限缺少必需的祖先权限");
    }

    await this.transactions.run(async (transaction) => {
      const role = await this.repository.lockRoleById(
        authContext.organizationId,
        dto.roleId,
        transaction,
      );

      if (!role) {
        throw new NotFoundException({
          code: apiErrorCodes.notFound,
          message: "角色不存在",
        });
      }

      if (role.isSystem || !role.isEditable) {
        throw new ForbiddenException({
          code: apiErrorCodes.forbidden,
          message: "系统角色受保护",
        });
      }

      const existing = await this.repository.lockPermissionKeysForRole(dto.roleId, transaction);
      const manageableExisting = existing.filter((permissionCode) =>
        manageable.has(permissionCode),
      );
      const unmanageableExisting = existing.filter(
        (permissionCode) => !manageable.has(permissionCode),
      );
      const next = [...new Set([...unmanageableExisting, ...requested])].toSorted();

      await this.repository.replaceRolePermissions(
        { roleId: dto.roleId, permissionKeys: next },
        transaction,
      );
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "role.permissions.changed",
          targetType: "role",
          targetId: dto.roleId,
          result: "succeeded",
          metadata: {
            manageableBefore: [...new Set(manageableExisting)].toSorted(),
            manageableAfter: requested,
          },
        },
        transaction,
      );
    });
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

  private badRequest(message: string): BadRequestException {
    return new BadRequestException({
      code: apiErrorCodes.validationFailed,
      message,
    });
  }
}
