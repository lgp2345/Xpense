import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthTokensResponse, ClientType } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { ServerConfigService } from "../../config/config.service.js";
import { AuditService } from "../audit/audit.service.js";
import { type AuthRefreshSession, AuthRepository } from "./auth.repository.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";

export type LoginInput = {
  email: string;
  password: string;
  clientType: ClientType;
  deviceId?: string;
  deviceName?: string;
  userAgent?: string;
  ip?: string;
};

export type RefreshInput = {
  refreshToken: string;
  transport: RefreshTransport;
};

export type RefreshTransport = "cookie" | "json_body";

export type RefreshResult = AuthTokensResponse & {
  clientType: ClientType;
};

export type LogoutInput = {
  authContext?: AuthContext;
  refreshToken?: string;
};

export type SessionResponse = {
  id: string;
  currentOrganizationId: string | null;
  clientType: ClientType;
  status: "active" | "revoked";
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly config: ServerConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(input: LoginInput): Promise<AuthTokensResponse> {
    const email = input.email.trim().toLowerCase();
    const user = await this.repository.findActiveUserByEmail(email);

    if (!user) {
      await this.auditService.append({
        organizationId: null,
        actorUserId: null,
        action: "auth.login.failed",
        targetType: "user",
        result: "failed",
        metadata: {
          email,
          clientType: input.clientType,
          reason: "user_not_found",
          ip: input.ip,
        },
      });
      throw this.unauthenticated("Invalid credentials");
    }

    const passwordMatches = await this.passwordService.verify(user.passwordHash, input.password);

    if (!passwordMatches || !user.defaultOrganizationId) {
      await this.auditService.append({
        organizationId: user.defaultOrganizationId,
        actorUserId: user.id,
        action: "auth.login.failed",
        targetType: "user",
        targetId: user.id,
        result: "failed",
        metadata: {
          email,
          clientType: input.clientType,
          reason: passwordMatches ? "missing_default_organization" : "password_mismatch",
          ip: input.ip,
        },
      });
      throw this.unauthenticated("Invalid credentials");
    }

    const refreshToken = this.tokenService.createRefreshToken();
    const refreshTokenHash = await this.tokenService.hashRefreshToken(refreshToken);
    const deviceIdHash = input.deviceId
      ? await this.tokenService.hashRefreshToken(input.deviceId)
      : undefined;
    const ipHash = input.ip ? await this.tokenService.hashRefreshToken(input.ip) : undefined;
    const session = await this.repository.createRefreshSession({
      userId: user.id,
      currentOrganizationId: user.defaultOrganizationId,
      clientType: input.clientType,
      deviceIdHash,
      deviceName: input.deviceName,
      refreshTokenHash,
      expiresAt: this.createRefreshTokenExpiresAt(),
      userAgent: input.userAgent,
      ipHash,
    });

    const accessToken = await this.tokenService.signAccessToken({
      userId: user.id,
      sessionId: session.id,
      organizationId: user.defaultOrganizationId,
    });

    await this.auditService.append({
      organizationId: user.defaultOrganizationId,
      actorUserId: user.id,
      action: "auth.login.succeeded",
      targetType: "session",
      targetId: session.id,
      result: "succeeded",
      metadata: {
        clientType: input.clientType,
        deviceName: input.deviceName,
        ip: input.ip,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async refresh(input: RefreshInput): Promise<RefreshResult> {
    const refreshTokenHash = await this.tokenService.hashRefreshToken(input.refreshToken);
    const session = await this.repository.findActiveSessionByRefreshTokenHash(refreshTokenHash);

    if (!session) {
      await this.auditService.append({
        organizationId: null,
        actorUserId: null,
        action: "auth.refresh.failed",
        targetType: "session",
        result: "failed",
        metadata: {
          reason: "session_not_found",
        },
      });
      throw this.unauthenticated("Invalid refresh session");
    }

    const tokenMatches = await this.tokenService.verifyRefreshTokenHash(
      input.refreshToken,
      session.refreshTokenHash,
    );

    if (!tokenMatches) {
      await this.auditService.append({
        organizationId: session.currentOrganizationId,
        actorUserId: session.userId,
        action: "auth.refresh.failed",
        targetType: "session",
        targetId: session.id,
        result: "failed",
        metadata: {
          reason: "token_mismatch",
        },
      });
      throw this.unauthenticated("Invalid refresh session");
    }

    try {
      this.assertRefreshSessionUsable(session);
      this.assertRefreshTransport(session.clientType, input.transport);
    } catch (error) {
      await this.auditService.append({
        organizationId: session.currentOrganizationId,
        actorUserId: session.userId,
        action: "auth.refresh.failed",
        targetType: "session",
        targetId: session.id,
        result: "failed",
        metadata: {
          reason: "session_unusable",
        },
      });
      throw error;
    }

    const nextRefreshToken = this.tokenService.createRefreshToken();
    const nextRefreshTokenHash = await this.tokenService.hashRefreshToken(nextRefreshToken);
    const now = this.getNow();

    const didRotate = await this.repository.updateRefreshSessionToken({
      sessionId: session.id,
      expectedRefreshTokenHash: session.refreshTokenHash,
      refreshTokenHash: nextRefreshTokenHash,
      rotatedAt: now,
      lastUsedAt: now,
    });

    if (!didRotate) {
      await this.auditService.append({
        organizationId: session.currentOrganizationId,
        actorUserId: session.userId,
        action: "auth.refresh.failed",
        targetType: "session",
        targetId: session.id,
        result: "failed",
        metadata: { reason: "rotation_conflict" },
      });
      throw this.unauthenticated("Invalid refresh session");
    }

    const accessToken = await this.tokenService.signAccessToken({
      userId: session.userId,
      sessionId: session.id,
      organizationId: session.currentOrganizationId,
    });

    await this.auditService.append({
      organizationId: session.currentOrganizationId,
      actorUserId: session.userId,
      action: "auth.refresh.succeeded",
      targetType: "session",
      targetId: session.id,
      result: "succeeded",
    });

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      clientType: session.clientType,
    };
  }

  async logout(input: LogoutInput): Promise<void> {
    const sessionsToRevoke = new Map<string, { organizationId: string | null; userId: string }>();

    if (input.refreshToken) {
      const refreshTokenHash = await this.tokenService.hashRefreshToken(input.refreshToken);
      const cookieSession =
        await this.repository.findActiveSessionByRefreshTokenHash(refreshTokenHash);

      if (cookieSession && this.isWebClient(cookieSession.clientType)) {
        sessionsToRevoke.set(cookieSession.id, {
          organizationId: cookieSession.currentOrganizationId,
          userId: cookieSession.userId,
        });
      }
    }

    if (input.authContext) {
      sessionsToRevoke.set(input.authContext.sessionId, {
        organizationId: input.authContext.organizationId,
        userId: input.authContext.userId,
      });
    }

    for (const [sessionId, session] of sessionsToRevoke) {
      await this.repository.revokeSession(sessionId);
      await this.auditService.append({
        organizationId: session.organizationId,
        actorUserId: session.userId,
        action: "auth.logout.succeeded",
        targetType: "session",
        targetId: sessionId,
        result: "succeeded",
      });
    }
  }

  async listSessions(authContext: AuthContext): Promise<SessionResponse[]> {
    const sessions = await this.repository.listUserSessions(authContext.userId);

    return sessions.map((session) => this.toSessionResponse(session));
  }

  async revokeSession(authContext: AuthContext, sessionId: string): Promise<void> {
    const session = await this.repository.findActiveSessionById(sessionId);

    if (!session || session.userId !== authContext.userId) {
      throw this.unauthenticated("Invalid refresh session");
    }

    await this.repository.revokeSession(sessionId);
    await this.auditService.append({
      organizationId: authContext.organizationId,
      actorUserId: authContext.userId,
      action: "auth.session.revoked",
      targetType: "session",
      targetId: sessionId,
      result: "succeeded",
    });
  }

  async revokeAllSessions(authContext: AuthContext): Promise<void> {
    await this.repository.revokeAllUserSessions(authContext.userId);
    await this.auditService.append({
      organizationId: authContext.organizationId,
      actorUserId: authContext.userId,
      action: "auth.sessions.revokedAll",
      targetType: "user",
      targetId: authContext.userId,
      result: "succeeded",
    });
  }

  private createRefreshTokenExpiresAt(): Date {
    const ttlMs = this.config.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

    return new Date(this.getNow().getTime() + ttlMs);
  }

  private getNow(): Date {
    return new Date();
  }

  private assertRefreshSessionUsable(
    session: AuthRefreshSession,
  ): asserts session is AuthRefreshSession & {
    currentOrganizationId: string;
  } {
    if (session.status !== "active" || session.expiresAt.getTime() <= this.getNow().getTime()) {
      throw this.unauthenticated("Invalid refresh session");
    }

    if (!session.currentOrganizationId) {
      throw this.unauthenticated("Invalid organization context");
    }
  }

  private assertRefreshTransport(clientType: ClientType, transport: RefreshTransport): void {
    const expectedTransport = this.isWebClient(clientType) ? "cookie" : "json_body";

    if (transport !== expectedTransport) {
      throw this.unauthenticated("Invalid refresh transport");
    }
  }

  private isWebClient(clientType: ClientType): boolean {
    return clientType === "web_pc" || clientType === "web_mobile";
  }

  private toSessionResponse(session: AuthRefreshSession): SessionResponse {
    return {
      id: session.id,
      currentOrganizationId: session.currentOrganizationId,
      clientType: session.clientType,
      status: session.status,
      expiresAt: session.expiresAt,
      rotatedAt: session.rotatedAt,
      revokedAt: session.revokedAt,
      lastUsedAt: session.lastUsedAt,
      createdAt: session.createdAt,
    };
  }

  private unauthenticated(message: string): UnauthorizedException {
    return new UnauthorizedException({
      code: apiErrorCodes.unauthenticated,
      message,
    });
  }
}
