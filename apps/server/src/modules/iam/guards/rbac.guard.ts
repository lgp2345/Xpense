import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PermissionKey } from "@xpense/shared";

import type { AuthContext } from "../../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../../common/errors/api-error.js";
import { AccessService } from "../access.service.js";
import { REQUIRE_PERMISSION_KEY } from "../decorators/require-permission.decorator.js";

type RequestWithAuthContext = {
  authContext?: AuthContext;
};

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessService: AccessService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithAuthContext>();
    const authContext = request.authContext;

    if (!authContext) {
      throw new UnauthorizedException({
        code: apiErrorCodes.unauthenticated,
        message: "缺少认证上下文",
      });
    }

    const requiredPermission = this.reflector.getAllAndOverride<
      PermissionKey | readonly PermissionKey[]
    >(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermission) {
      return true;
    }

    const permissions = Array.isArray(requiredPermission)
      ? requiredPermission
      : [requiredPermission];
    for (const permission of permissions) {
      this.accessService.assertPermission(authContext, permission);
    }

    return true;
  }
}
