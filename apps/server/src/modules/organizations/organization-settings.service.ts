import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { OrganizationProfile, PermissionKey } from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccessService } from "../iam/access.service.js";
import { OrganizationOwnerRepository } from "../iam/organization-owner.repository.js";
import type { UpdateOrganizationProfileDto } from "./dto/update-organization-profile.dto.js";
import { OrganizationManagementRepository } from "./organization-management.repository.js";

@Injectable()
export class OrganizationSettingsService {
  constructor(
    private readonly repository: OrganizationManagementRepository,
    private readonly owners: OrganizationOwnerRepository,
    private readonly access: AccessService,
    private readonly transactions: DatabaseTransactionService,
    private readonly audit: AuditService,
  ) {}

  private async assertOwner(
    ctx: AuthContext,
    permission: PermissionKey,
    tx?: AppDbExecutor,
  ): Promise<void> {
    this.access.assertPermission(ctx, permission);
    const user = await this.owners.findActiveUser(ctx.userId, tx);
    if (
      !user ||
      (!user.isSuperAdmin &&
        (await this.owners.findActiveMemberRole(ctx.organizationId, ctx.userId, tx)) !== "owner")
    )
      throw new ForbiddenException("仅当前组织负责人或平台超级管理员可维护组织资料");
  }
  async get(ctx: AuthContext): Promise<OrganizationProfile> {
    await this.assertOwner(ctx, "organization_settings:read");
    const profile = await this.repository.profile(ctx.organizationId);
    if (!profile) throw new NotFoundException("组织不存在");
    return profile;
  }
  async update(
    ctx: AuthContext,
    input: UpdateOrganizationProfileDto,
  ): Promise<OrganizationProfile> {
    return this.transactions.run(async (tx) => {
      if (!(await this.owners.lockOrganization(ctx.organizationId, tx)))
        throw new ForbiddenException("组织无效或已停用");
      await this.assertOwner(ctx, "organization_settings:update", tx);
      const profile = await this.repository.updateProfile(ctx.organizationId, input, tx);
      await this.audit.appendRequired(
        {
          organizationId: ctx.organizationId,
          actorUserId: ctx.userId,
          action: "organization.profile.updated",
          targetType: "organization",
          targetId: ctx.organizationId,
          result: "succeeded",
          metadata: {
            fields: Object.keys(input),
            accessSource: ctx.isSuperAdmin ? "platform" : "membership",
          },
        },
        tx,
      );
      return profile;
    });
  }
}
