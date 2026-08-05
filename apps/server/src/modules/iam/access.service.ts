import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { AccessTokenPayload } from "../auth/token.service.js";
import { AccessRepository } from "./access.repository.js";

@Injectable()
export class AccessService {
  constructor(private readonly repository: AccessRepository) {}

  async resolveAuthContext(payload: AccessTokenPayload): Promise<AuthContext> {
    const session = await this.repository.findActiveSession(payload);

    if (!session) {
      throw this.unauthenticated("会话无效或已失效");
    }

    const user = await this.repository.findActiveUser(payload.userId);

    if (!user) {
      throw this.unauthenticated("用户无效或已停用");
    }

    const organization = await this.repository.findActiveOrganization(payload.organizationId);

    if (!organization) {
      throw this.forbidden("组织无效或已停用");
    }

    const membership = await this.repository.findActiveMembership(
      payload.userId,
      payload.organizationId,
    );

    if (!membership) {
      throw this.forbidden("用户不是该组织的有效成员");
    }

    return {
      userId: payload.userId,
      sessionId: payload.sessionId,
      organizationId: payload.organizationId,
      isSuperAdmin: user.isSuperAdmin,
      permissions: await this.repository.listPermissionKeysForRole(membership.roleId),
    };
  }

  assertPermission(authContext: AuthContext, requiredPermission: PermissionKey): void {
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
