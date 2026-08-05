import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthTokensResponse } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { AuditService } from "../audit/audit.service.js";
import { TokenService } from "../auth/token.service.js";
import { OrganizationsRepository, type UserOrganization } from "./organizations.repository.js";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  listOrganizations(authContext: AuthContext): Promise<UserOrganization[]> {
    return this.repository.listActiveOrganizationsForUser(authContext.userId);
  }

  async switchCurrentOrganization(
    authContext: AuthContext,
    organizationId: string,
  ): Promise<AuthTokensResponse> {
    const membership = await this.repository.findActiveMembership(
      authContext.userId,
      organizationId,
    );

    if (!membership) {
      throw new ForbiddenException({
        code: apiErrorCodes.forbidden,
        message: "用户不是该组织的有效成员",
      });
    }

    await this.repository.updateSessionOrganization(authContext.sessionId, organizationId);

    const accessToken = await this.tokenService.signAccessToken({
      userId: authContext.userId,
      sessionId: authContext.sessionId,
      organizationId,
    });

    await this.auditService.append({
      organizationId,
      actorUserId: authContext.userId,
      action: "organization.switched",
      targetType: "organization",
      targetId: organizationId,
      result: "succeeded",
      metadata: {
        fromOrganizationId: authContext.organizationId,
      },
    });

    return { accessToken };
  }
}
