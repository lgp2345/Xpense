import { Body, Controller, Dependencies, Get, HttpCode, Param, Post } from "@nestjs/common";
import type { AuthTokensResponse } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import type { SessionResponse } from "./auth.service.js";
import { AuthService } from "./auth.service.js";
// biome-ignore lint/style/useImportType: Nest needs DTO classes at runtime for validation metadata.
import { LoginDto } from "./dto/login.dto.js";
// biome-ignore lint/style/useImportType: Nest needs DTO classes at runtime for validation metadata.
import { RefreshDto } from "./dto/refresh.dto.js";

@Controller("auth")
@Dependencies(AuthService)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto): Promise<AuthTokensResponse> {
    return this.authService.login(dto);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto): Promise<AuthTokensResponse> {
    return this.authService.refresh(dto);
  }

  @Post("logout")
  @HttpCode(204)
  logout(@CurrentAuthContext() authContext: AuthContext): Promise<void> {
    return this.authService.logout(authContext);
  }

  @Get("sessions")
  listSessions(@CurrentAuthContext() authContext: AuthContext): Promise<SessionResponse[]> {
    return this.authService.listSessions(authContext);
  }

  @Post("sessions/:id/revoke")
  @HttpCode(204)
  revokeSession(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("id") sessionId: string,
  ): Promise<void> {
    return this.authService.revokeSession(authContext, sessionId);
  }

  @Post("sessions/revoke-all")
  @HttpCode(204)
  revokeAllSessions(@CurrentAuthContext() authContext: AuthContext): Promise<void> {
    return this.authService.revokeAllSessions(authContext);
  }
}
