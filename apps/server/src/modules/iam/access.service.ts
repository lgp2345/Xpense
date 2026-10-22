import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import type { AccessTokenPayload } from "../auth/token.service.js";
import { AccessRepository } from "./access.repository.js";

@Injectable()
export class AccessService {
  constructor(private readonly repository: AccessRepository) {}

  async resolveAuthContext(payload: AccessTokenPayload): Promise<AuthContext> {
    const context = await this.resolveSessionContext(payload);
    if (context.accessScope !== "organization") {
      throw this.forbidden("请先进入组织");
    }
    const { accessScope: _, ...authContext } = context;
    return authContext;
  }

  async resolveSessionContext(
    payload: AccessTokenPayload,
    executor?: AppDbExecutor,
  ): Promise<SessionAuthContext> {
    const session = await this.repository.findActiveSession(payload, executor);

    if (!session) {
      throw this.unauthenticated("会话无效或已失效");
    }

    const user = await this.repository.findActiveUser(payload.userId, executor);

    if (!user) {
      throw this.unauthenticated("用户无效或已停用");
    }

    if (payload.organizationId === null) {
      if (!user.isSuperAdmin) throw this.forbidden("当前账号无平台访问权限");
      return {
        ...payload,
        organizationId: null,
        accessScope: "platform",
        isSuperAdmin: true,
        permissions: [],
      };
    }

    const organization = await this.repository.findActiveOrganization(
      payload.organizationId,
      executor,
    );

    if (!organization) {
      throw this.forbidden("组织无效或已停用");
    }

    const membership = await this.repository.findActiveMembership(
      payload.userId,
      payload.organizationId,
      executor,
    );

    if (!membership && !user.isSuperAdmin) {
      throw this.forbidden("用户不是该组织的有效成员");
    }

    return {
      accessScope: "organization",
      userId: payload.userId,
      sessionId: payload.sessionId,
      organizationId: payload.organizationId,
      isSuperAdmin: user.isSuperAdmin,
      permissions: membership
        ? await this.repository.listPermissionKeysForRole(membership.roleId, executor)
        : [],
    };
  }

  assertPermission(
    authContext: Pick<AuthContext, "isSuperAdmin" | "permissions">,
    requiredPermission: PermissionKey,
  ): void {
    if (authContext.isSuperAdmin || authContext.permissions.includes(requiredPermission)) {
      return;
    }

    throw this.forbidden("缺少所需权限");
  }

  private unauthenticated(message: string): UnauthorizedException {
    return new UnauthorizedException({
      code: apiErrorCodes.unauthenticated,
      message,
    });
  }

  private forbidden(message: string): ForbiddenException {
    return new ForbiddenException({
      code: apiErrorCodes.forbidden,
      message,
    });
  }
}
