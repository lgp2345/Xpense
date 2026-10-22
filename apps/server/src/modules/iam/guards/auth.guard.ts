import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { AuthContext } from "../../../common/auth/auth-context.js";
import type { SessionAuthContext } from "../../../common/auth/session-auth-context.js";
import { apiErrorCodes } from "../../../common/errors/api-error.js";
import { SessionAuthGuard } from "./session-auth.guard.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessionGuard: SessionAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.sessionGuard.canActivate(context);
    const request = context
      .switchToHttp()
      .getRequest<{ sessionContext: SessionAuthContext; authContext?: AuthContext }>();
    if (request.sessionContext.accessScope !== "organization") {
      throw new ForbiddenException({ code: apiErrorCodes.forbidden, message: "请先进入组织" });
    }
    const { accessScope: _, ...authContext } = request.sessionContext;
    request.authContext = authContext;
    return true;
  }
}
