import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import type { AuthContext } from "../../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../../common/errors/api-error.js";
import { TokenService } from "../../auth/token.service.js";
import { AccessService } from "../access.service.js";

type RequestWithAuthContext = {
  headers: {
    authorization?: string | string[];
  };
  authContext?: AuthContext;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly accessService: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthContext>();
    const accessToken = this.extractBearerToken(request.headers.authorization);

    if (!accessToken) {
      throw this.unauthenticated("缺少访问令牌");
    }

    try {
      const payload = await this.tokenService.verifyAccessToken(accessToken);
      request.authContext = await this.accessService.resolveAuthContext(payload);

      return true;
    } catch {
      throw this.unauthenticated("访问令牌无效");
    }
  }

  private extractBearerToken(authorization: string | string[] | undefined): string | null {
    const header = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!header) {
      return null;
    }

    const match = /^Bearer\s+(.+)$/i.exec(header);

    return match?.[1] ?? null;
  }

  private unauthenticated(message: string): UnauthorizedException {
    return new UnauthorizedException({
      code: apiErrorCodes.unauthenticated,
      message,
    });
  }
}
