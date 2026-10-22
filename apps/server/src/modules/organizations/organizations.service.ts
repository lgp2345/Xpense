import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthTokensResponse } from "@xpense/shared";

import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthRepository } from "../auth/auth.repository.js";
import { TokenService } from "../auth/token.service.js";
import { OrganizationsRepository, type UserOrganization } from "./organizations.repository.js";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly authRepository: AuthRepository,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  listOrganizations(authContext: SessionAuthContext): Promise<UserOrganization[]> {
    return this.repository.listActiveOrganizationsForUser(authContext.userId);
  }

  async switchCurrentOrganization(
    authContext: SessionAuthContext,
    organizationId: string,
  ): Promise<AuthTokensResponse> {
    return this.transactions.run(async (transaction) => {
      const user = await this.authRepository.lockActiveUser(authContext.userId, transaction);
      if (!user)
        throw new UnauthorizedException({
          code: apiErrorCodes.unauthenticated,
          message: "用户无效或已停用",
        });
      const session = await this.authRepository.lockActiveSession(authContext, transaction);
      if (!session)
        throw new UnauthorizedException({
          code: apiErrorCodes.unauthenticated,
          message: "会话无效或已失效",
        });
      const target = user.isSuperAdmin
        ? await this.repository.findActiveOrganization(organizationId, transaction)
        : await this.repository.findActiveMembership(user.id, organizationId, transaction);
      if (!target)
        throw new ForbiddenException({
          code: apiErrorCodes.forbidden,
          message: "组织不可用或当前账号没有访问资格",
        });
      await this.authRepository.updateSessionOrganization(session.id, organizationId, transaction);
      if (!user.isSuperAdmin)
        await this.authRepository.updateLastOrganization(user.id, organizationId, transaction);
      const accessToken = await this.tokenService.signAccessToken({
        userId: user.id,
        sessionId: session.id,
        organizationId,
      });
      await this.auditService.appendRequired(
        {
          organizationId,
          actorUserId: user.id,
          action: "organization.switched",
          targetType: "organization",
          targetId: organizationId,
          result: "succeeded",
          metadata: {
            fromOrganizationId: authContext.organizationId,
            accessSource: user.isSuperAdmin ? "platform" : "membership",
          },
        },
        transaction,
      );
      return { accessToken };
    });
  }
}
