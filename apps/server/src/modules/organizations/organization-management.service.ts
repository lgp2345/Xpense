import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  OrganizationDetail,
  OrganizationListQuery,
  OrganizationListResponse,
  OrganizationOwnerCandidate,
} from "@xpense/shared";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { PasswordService } from "../auth/password.service.js";
import type { CreateOrganizationDto } from "./dto/create-organization.dto.js";
import { OrganizationInitializer } from "./organization-initializer.js";
import { OrganizationManagementRepository } from "./organization-management.repository.js";

@Injectable()
export class OrganizationManagementService {
  constructor(
    private readonly repository: OrganizationManagementRepository,
    private readonly transactions: DatabaseTransactionService,
    private readonly passwords: PasswordService,
    private readonly initializer: OrganizationInitializer,
    private readonly audit: AuditService,
  ) {}

  private async assertSuperAdmin(
    ctx: SessionAuthContext,
    tx?: AppDbExecutor,
    lock = false,
  ): Promise<void> {
    if (!(await this.repository.findActor(ctx.userId, tx, lock))?.isSuperAdmin)
      throw new ForbiddenException("仅平台超级管理员可管理组织");
  }
  async list(
    ctx: SessionAuthContext,
    input: OrganizationListQuery,
  ): Promise<OrganizationListResponse> {
    await this.assertSuperAdmin(ctx);
    return this.repository.list(input);
  }
  async detail(ctx: SessionAuthContext, id: string): Promise<OrganizationDetail> {
    await this.assertSuperAdmin(ctx);
    const detail = await this.repository.detail(id);
    if (!detail) throw new NotFoundException("组织不存在");
    return detail;
  }
  async resolveOwner(
    ctx: SessionAuthContext,
    phone: string,
  ): Promise<OrganizationOwnerCandidate | null> {
    await this.assertSuperAdmin(ctx);
    return this.repository.findOwnerCandidate(phone);
  }

  async create(ctx: SessionAuthContext, input: CreateOrganizationDto): Promise<OrganizationDetail> {
    try {
      return await this.transactions.run(async (tx) => {
        await this.assertSuperAdmin(ctx, tx, true);
        const roleId = await this.repository.findBuiltinOwnerRole(tx);
        if (!roleId) throw new ServiceUnavailableException("负责人系统角色未初始化");
        for (const owner of input.owners) {
          const existing = await this.repository.findOwnerCandidate(owner.phone, tx);
          if (owner.kind === "new" && existing)
            throw new ConflictException("负责人手机号已注册，请重新确认关联已有账号");
          if (owner.kind === "existing") {
            if (!existing || existing.userId !== owner.userId)
              throw new ConflictException("账号信息已变化，请重新确认关联");
            if (existing.status !== "active")
              throw new ForbiddenException("已停用账号不可关联为负责人");
          }
        }
        const { owners: _, ...profile } = input;
        const organization = await this.repository.insertOrganization(profile, ctx.userId, tx);
        const userIds: string[] = [];
        for (const owner of input.owners) {
          if (owner.kind === "existing") userIds.push(owner.userId);
          else
            userIds.push(
              await this.repository.insertUser(
                {
                  phone: owner.phone,
                  email: owner.email ?? null,
                  passwordHash: await this.passwords.hash(owner.initialPassword),
                },
                tx,
              ),
            );
        }
        await this.repository.addOwners(organization.id, userIds, roleId, tx);
        await this.initializer.initialize(tx, organization.id);
        await this.audit.appendRequired(
          {
            organizationId: organization.id,
            actorUserId: ctx.userId,
            action: "organization.created",
            targetType: "organization",
            targetId: organization.id,
            result: "succeeded",
            metadata: { ownerUserIds: userIds, accessSource: "platform" },
          },
          tx,
        );
        const detail = await this.repository.detail(organization.id, tx);
        if (!detail) throw new Error("新建组织不可读取");
        return detail;
      });
    } catch (error) {
      const failures = [error, error instanceof Error ? error.cause : undefined];
      const unique = failures.find(
        (value) =>
          typeof value === "object" && value !== null && "code" in value && value.code === "23505",
      );
      if (unique)
        throw new ConflictException("组织名称、负责人手机号或邮箱已被使用，请刷新信息后重试");
      throw error;
    }
  }
}
