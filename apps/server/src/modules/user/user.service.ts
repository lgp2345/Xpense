import { ForbiddenException, Injectable } from "@nestjs/common";
import { type CurrentUserResponse, permissionKeys } from "@xpense/shared";

import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { UserRepository } from "./user.repository.js";

@Injectable()
export class UserService {
  constructor(private readonly repository: UserRepository) {}

  async getCurrentUser(authContext: SessionAuthContext): Promise<CurrentUserResponse> {
    const currentContext = await this.repository.findCurrentUserContext(authContext);

    if (!currentContext) {
      throw new ForbiddenException({
        code: apiErrorCodes.forbidden,
        message: "当前用户上下文不可用",
      });
    }

    const { membershipId, ...userContext } = currentContext;

    return {
      ...userContext,
      permissions:
        currentContext.accessScope === "platform"
          ? []
          : currentContext.user.isSuperAdmin
            ? [...permissionKeys]
            : membershipId
              ? [...new Set(await this.repository.listPermissionKeysForMembership(membershipId))]
              : [],
    };
  }
}
