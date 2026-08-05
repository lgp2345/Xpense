import { ForbiddenException, Injectable } from "@nestjs/common";
import { type CurrentUserResponse, permissionKeys } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { UserRepository } from "./user.repository.js";

@Injectable()
export class UserService {
  constructor(private readonly repository: UserRepository) {}

  async getCurrentUser(authContext: AuthContext): Promise<CurrentUserResponse> {
    const currentContext = await this.repository.findCurrentUserContext(authContext);

    if (!currentContext) {
      throw new ForbiddenException({
        code: apiErrorCodes.forbidden,
        message: "当前用户上下文不可用",
      });
    }

    return {
      ...currentContext,
      permissions: currentContext.user.isSuperAdmin
        ? [...permissionKeys]
        : await this.repository.listPermissionKeysForRole(currentContext.role.id),
    };
  }
}
