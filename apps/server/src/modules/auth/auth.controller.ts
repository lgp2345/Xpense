import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { AuthTokensResponse, ClientType } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { ServerConfigService } from "../../config/config.service.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import type { SessionResponse } from "./auth.service.js";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { RefreshDto } from "./dto/refresh.dto.js";
import { OptionalAuthGuard } from "./optional-auth.guard.js";

type AuthCookieRequest = {
  authContext?: AuthContext;
  cookies: Record<string, string | undefined>;
};

type AuthCookieReply = {
  clearCookie(name: string, options: { path: string }): unknown;
  setCookie(name: string, value: string, options: RefreshCookieOptions): unknown;
};

type RefreshCookieOptions = {
  httpOnly: true;
  maxAge: number;
  path: string;
  sameSite: "lax";
  secure: boolean;
};

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ServerConfigService,
  ) {}

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: AuthCookieReply,
  ): Promise<AuthTokensResponse> {
    const tokens = await this.authService.login(dto);

    if (!this.isWebClient(dto.clientType)) {
      return tokens;
    }

    this.setRefreshCookie(reply, this.requireRefreshToken(tokens));

    return { accessToken: tokens.accessToken };
  }

  @Post("refresh")
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: AuthCookieRequest,
    @Res({ passthrough: true }) reply: AuthCookieReply,
  ): Promise<AuthTokensResponse> {
    const bodyRefreshToken = dto.refreshToken;
    const cookieRefreshToken = request.cookies[this.config.env.WEB_REFRESH_TOKEN_COOKIE];
    const refreshToken = bodyRefreshToken ?? cookieRefreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException({
        code: apiErrorCodes.unauthenticated,
        message: "缺少刷新会话",
      });
    }

    const tokens = await this.authService.refresh({
      refreshToken,
      transport: bodyRefreshToken ? "json_body" : "cookie",
    });

    if (!this.isWebClient(tokens.clientType)) {
      return {
        accessToken: tokens.accessToken,
        refreshToken: this.requireRefreshToken(tokens),
      };
    }

    this.setRefreshCookie(reply, this.requireRefreshToken(tokens));

    return { accessToken: tokens.accessToken };
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(OptionalAuthGuard)
  logout(
    @Req() request: AuthCookieRequest,
    @Res({ passthrough: true }) reply: AuthCookieReply,
  ): Promise<void> {
    reply.clearCookie(this.config.env.WEB_REFRESH_TOKEN_COOKIE, {
      path: this.config.webRefreshCookiePath,
    });

    return this.authService.logout({
      authContext: request.authContext,
      refreshToken: request.cookies[this.config.env.WEB_REFRESH_TOKEN_COOKIE],
    });
  }

  @Get("sessions")
  @RequirePermission("sessions:read")
  @UseGuards(AuthGuard, RbacGuard)
  listSessions(@CurrentAuthContext() authContext: AuthContext): Promise<SessionResponse[]> {
    return this.authService.listSessions(authContext);
  }

  @Post("sessions/:id/revoke")
  @HttpCode(204)
  @RequirePermission("sessions:revoke")
  @UseGuards(AuthGuard, RbacGuard)
  revokeSession(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("id") sessionId: string,
  ): Promise<void> {
    return this.authService.revokeSession(authContext, sessionId);
  }

  @Post("sessions/revoke-all")
  @HttpCode(204)
  @RequirePermission("sessions:revoke")
  @UseGuards(AuthGuard, RbacGuard)
  revokeAllSessions(@CurrentAuthContext() authContext: AuthContext): Promise<void> {
    return this.authService.revokeAllSessions(authContext);
  }

  private isWebClient(clientType: ClientType): boolean {
    return clientType === "web_pc" || clientType === "web_mobile";
  }

  private requireRefreshToken(tokens: AuthTokensResponse): string {
    if (!tokens.refreshToken) {
      throw new Error("Auth service did not return a refresh token");
    }

    return tokens.refreshToken;
  }

  private setRefreshCookie(reply: AuthCookieReply, refreshToken: string): void {
    reply.setCookie(
      this.config.env.WEB_REFRESH_TOKEN_COOKIE,
      refreshToken,
      this.getRefreshCookieOptions(),
    );
  }

  private getRefreshCookieOptions(): RefreshCookieOptions {
    return {
      httpOnly: true,
      sameSite: "lax",
      path: this.config.webRefreshCookiePath,
      maxAge: this.config.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      secure: new URL(this.config.env.WEB_ORIGIN).protocol === "https:",
    };
  }
}
