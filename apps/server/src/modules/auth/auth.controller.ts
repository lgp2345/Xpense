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
import type { AuthTokensResponse, CaptchaChallengeResponse, ClientType } from "@xpense/shared";
import { CurrentSessionContext } from "../../common/auth/current-session-context.decorator.js";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { ServerConfigService } from "../../config/config.service.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { SessionAuthGuard } from "../iam/guards/session-auth.guard.js";
import { AccountPasswordService } from "./account-password.service.js";
import type { SessionResponse } from "./auth.service.js";
import { AuthService } from "./auth.service.js";
import { CaptchaService } from "./captcha.service.js";
import { type ChangePasswordDto, changePasswordSchema } from "./dto/change-password.dto.js";
import { type LoginDto, loginSchema } from "./dto/login.dto.js";
import { type RefreshDto, refreshSchema } from "./dto/refresh.dto.js";
import { OptionalAuthGuard } from "./optional-auth.guard.js";

type AuthCookieRequest = {
  sessionContext?: SessionAuthContext;
  cookies: Record<string, string | undefined>;
};

type AuthLoginRequest = {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
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
    private readonly captchaService: CaptchaService,
    private readonly config: ServerConfigService,
    private readonly accountPassword: AccountPasswordService,
  ) {}

  @Get("captcha")
  @HttpCode(200)
  captcha(): CaptchaChallengeResponse {
    return this.captchaService.issue();
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body({ schema: loginSchema }) dto: LoginDto,
    @Req() request: AuthLoginRequest,
    @Res({ passthrough: true }) reply: AuthCookieReply,
  ): Promise<AuthTokensResponse> {
    const tokens = await this.authService.login({
      ...dto,
      ip: request.ip,
      userAgent: toHeaderValue(request.headers["user-agent"]),
    });

    if (!this.isWebClient(dto.clientType)) {
      return tokens;
    }

    this.setRefreshCookie(reply, this.requireRefreshToken(tokens));

    return { accessToken: tokens.accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Body({ schema: refreshSchema }) dto: RefreshDto,
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
      authContext: request.sessionContext,
      refreshToken: request.cookies[this.config.env.WEB_REFRESH_TOKEN_COOKIE],
    });
  }

  @Post("password/update")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  async changePassword(
    @CurrentSessionContext() ctx: SessionAuthContext,
    @Body({ schema: changePasswordSchema }) dto: ChangePasswordDto,
    @Res({ passthrough: true }) reply: AuthCookieReply,
  ): Promise<AuthTokensResponse> {
    const tokens = await this.accountPassword.changePassword(ctx, dto);
    if (!this.isWebClient(tokens.clientType))
      return { accessToken: tokens.accessToken, refreshToken: this.requireRefreshToken(tokens) };
    this.setRefreshCookie(reply, this.requireRefreshToken(tokens));
    return { accessToken: tokens.accessToken };
  }

  @Post("platform")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  returnToPlatform(
    @CurrentSessionContext() context: SessionAuthContext,
  ): Promise<AuthTokensResponse> {
    return this.authService.returnToPlatform(context);
  }

  @Get("sessions")
  @RequirePermission("sessions:read")
  @UseGuards(SessionAuthGuard, RbacGuard)
  listSessions(
    @CurrentSessionContext() authContext: SessionAuthContext,
  ): Promise<SessionResponse[]> {
    return this.authService.listSessions(authContext);
  }

  @Post("sessions/:id/revoke")
  @HttpCode(200)
  @RequirePermission("sessions:revoke")
  @UseGuards(SessionAuthGuard, RbacGuard)
  revokeSession(
    @CurrentSessionContext() authContext: SessionAuthContext,
    @Param("id") sessionId: string,
  ): Promise<void> {
    return this.authService.revokeSession(authContext, sessionId);
  }

  @Post("sessions/revoke-all")
  @HttpCode(200)
  @RequirePermission("sessions:revoke")
  @UseGuards(SessionAuthGuard, RbacGuard)
  revokeAllSessions(@CurrentSessionContext() authContext: SessionAuthContext): Promise<void> {
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

function toHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
