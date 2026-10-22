import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { ChangePasswordInput } from "@xpense/shared";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { ServerConfigService } from "../../config/config.service.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AccountPasswordRepository } from "./account-password.repository.js";
import { AuthRepository } from "./auth.repository.js";
import type { RefreshResult } from "./auth.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";

@Injectable()
export class AccountPasswordService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly repository: AccountPasswordRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ServerConfigService,
    private readonly transactions: DatabaseTransactionService,
    private readonly audit: AuditService,
  ) {}

  async changePassword(
    ctx: SessionAuthContext,
    input: ChangePasswordInput,
  ): Promise<RefreshResult> {
    const passwordHash = await this.passwords.hash(input.newPassword);
    return this.transactions.run(async (tx) => {
      const user = await this.authRepository.lockActiveUser(ctx.userId, tx);
      if (!user) throw new UnauthorizedException("用户无效或已停用");
      const session = await this.authRepository.lockActiveSession(ctx, tx);
      if (!session) throw new UnauthorizedException("会话无效或已失效");
      if (!(await this.passwords.verify(user.passwordHash, input.currentPassword)))
        throw new BadRequestException("当前密码错误");
      if (input.currentPassword === input.newPassword)
        throw new BadRequestException("新密码不能与当前密码相同");
      if (
        ctx.organizationId === null
          ? !user.isSuperAdmin
          : !(await this.repository.canUseOrganization(
              user.id,
              ctx.organizationId,
              user.isSuperAdmin,
              tx,
            ))
      )
        throw new ForbiddenException("当前访问资格已失效，请重新登录");
      await this.repository.updatePassword(user.id, passwordHash, tx);
      await this.authRepository.revokeAllUserSessions(user.id, tx);
      const refreshToken = this.tokens.createRefreshToken();
      const nextSession = await this.authRepository.createRefreshSession(
        {
          userId: user.id,
          currentOrganizationId: ctx.organizationId,
          clientType: session.clientType,
          refreshTokenHash: await this.tokens.hashRefreshToken(refreshToken),
          expiresAt: new Date(Date.now() + this.config.env.REFRESH_TOKEN_TTL_DAYS * 86400000),
        },
        tx,
      );
      const accessToken = await this.tokens.signAccessToken({
        userId: user.id,
        sessionId: nextSession.id,
        organizationId: ctx.organizationId,
      });
      await this.audit.appendRequired(
        {
          organizationId: ctx.organizationId,
          actorUserId: user.id,
          action: "auth.password.changed",
          targetType: "user",
          targetId: user.id,
          result: "succeeded",
          metadata: { accessSource: user.isSuperAdmin ? "platform" : "membership" },
        },
        tx,
      );
      return { accessToken, refreshToken, clientType: session.clientType };
    });
  }
}
