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
      throw this.unauthenticated("Invalid or inactive session");
    }

    const user = await this.repository.findActiveUser(payload.userId);

    if (!user) {
      throw this.unauthenticated("Invalid or inactive user");
    }

    const organization = await this.repository.findActiveOrganization(payload.organizationId);

    if (!organization) {
      throw this.forbidden("Invalid or inactive organization");
    }

    const membership = await this.repository.findActiveMembership(
      payload.userId,
      payload.organizationId,
    );

    if (!membership) {
      throw this.forbidden("User is not an active organization member");
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

    throw this.forbidden("Missing required permission");
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
