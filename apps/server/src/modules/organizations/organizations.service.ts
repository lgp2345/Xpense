import { Dependencies, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthTokensResponse } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { TokenService } from "../auth/token.service.js";
import { OrganizationsRepository, type UserOrganization } from "./organizations.repository.js";

@Injectable()
@Dependencies(OrganizationsRepository, TokenService)
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly tokenService: TokenService,
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
        message: "User is not an active member of the organization",
      });
    }

    await this.repository.updateSessionOrganization(authContext.sessionId, organizationId);

    return {
      accessToken: await this.tokenService.signAccessToken({
        userId: authContext.userId,
        sessionId: authContext.sessionId,
        organizationId,
      }),
    };
  }
}
