import { Injectable, NotFoundException } from "@nestjs/common";
import type { AccountSummary } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccountsRepository } from "./accounts.repository.js";
import type { AccountListRecord } from "./bookkeeping.types.js";
import { BookkeepingWriteLockRepository } from "./bookkeeping-write-lock.repository.js";
import type { CreateAccountDto } from "./dto/create-account.dto.js";
import type { DeleteAccountDto } from "./dto/delete-account.dto.js";
import type { UpdateAccountDto } from "./dto/update-account.dto.js";
import { OpeningBalanceService } from "./opening-balance.service.js";

/** 承担账户的组织隔离、事务编排、期初余额与必需审计规则。 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly repository: AccountsRepository,
    private readonly writeLockRepository: BookkeepingWriteLockRepository,
    private readonly openingBalanceService: OpeningBalanceService,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  /**
   * 列出当前组织未删除账户及其派生余额。
   * @param authContext 可信认证上下文。
   */
  async list(authContext: AuthContext): Promise<AccountSummary[]> {
    const rows = await this.repository.listActive(authContext.organizationId);

    return rows.map((row) => this.toSummary(row));
  }

  /**
   * 创建账户，并在初始余额非零时于同一事务写入排除型交易和流水。
   * @param authContext 可信认证上下文。
   * @param dto 已通过全局 Zod 管道校验的请求。
   * @returns 创建后的账户及期初余额。
   */
  create(authContext: AuthContext, dto: CreateAccountDto): Promise<AccountSummary> {
    return this.transactions.run(async (transaction) => {
      await this.lockOrganization(authContext.organizationId, transaction);
      const account = await this.repository.create(
        {
          organizationId: authContext.organizationId,
          createdByUserId: authContext.userId,
          name: dto.name,
          type: dto.type,
          icon: dto.icon,
          color: dto.color,
          sortOrder: dto.sortOrder,
        },
        transaction,
      );
      let openingBalanceTransactionId: string | undefined;

      if (dto.initialBalanceMinor !== undefined && dto.initialBalanceMinor !== 0) {
        openingBalanceTransactionId = await this.openingBalanceService.create(
          {
            organizationId: authContext.organizationId,
            accountId: account.id,
            actorUserId: authContext.userId,
            amountMinor: dto.initialBalanceMinor,
          },
          transaction,
        );
      }

      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "account.created",
          targetType: "account",
          targetId: account.id,
          result: "succeeded",
          metadata: openingBalanceTransactionId ? { openingBalanceTransactionId } : {},
        },
        transaction,
      );

      const summary = await this.repository.findActiveSummary(
        authContext.organizationId,
        account.id,
        transaction,
      );

      if (!summary) {
        throw new Error("Created account is unavailable");
      }

      return this.toSummary(summary);
    });
  }

  /**
   * 更新当前组织内有效账户并在同一事务写入必需审计。
   * @param authContext 可信认证上下文。
   * @param dto 账户 ID 和至少一个可变字段。
   * @throws NotFoundException 账户跨组织、已删除或不存在时抛出。
   */
  async update(authContext: AuthContext, dto: UpdateAccountDto): Promise<AccountSummary> {
    return this.transactions.run(async (transaction) => {
      await this.lockOrganization(authContext.organizationId, transaction);
      const account = await this.repository.findActiveOwnedAccount(
        authContext.organizationId,
        dto.id,
        transaction,
      );

      if (!account) {
        throw this.notFound();
      }

      const updated = await this.repository.update(
        {
          id: dto.id,
          organizationId: authContext.organizationId,
          name: dto.name,
          type: dto.type,
          icon: dto.icon,
          color: dto.color,
          sortOrder: dto.sortOrder,
        },
        transaction,
      );
      const changedFields = ["name", "type", "icon", "color", "sortOrder"].filter(
        (field) => dto[field as keyof UpdateAccountDto] !== undefined,
      );

      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "account.updated",
          targetType: "account",
          targetId: dto.id,
          result: "succeeded",
          metadata: { changedFields },
        },
        transaction,
      );

      const summary = await this.repository.findActiveSummary(
        authContext.organizationId,
        updated.id,
        transaction,
      );

      if (!summary) {
        throw new Error("Updated account is unavailable");
      }

      return this.toSummary(summary);
    });
  }

  /**
   * 软删除当前组织内有效账户，并与必需审计在同一事务提交。
   * @param authContext 可信认证上下文。
   * @param dto 待删除账户 ID。
   * @throws NotFoundException 账户跨组织、已删除或不存在时抛出。
   */
  delete(authContext: AuthContext, dto: DeleteAccountDto): Promise<void> {
    return this.transactions.run(async (transaction) => {
      await this.lockOrganization(authContext.organizationId, transaction);
      const account = await this.repository.findActiveOwnedAccount(
        authContext.organizationId,
        dto.id,
        transaction,
      );

      if (!account) {
        throw this.notFound();
      }

      await this.repository.softDelete(
        {
          id: dto.id,
          organizationId: authContext.organizationId,
          deletedByUserId: authContext.userId,
        },
        transaction,
      );
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "account.deleted",
          targetType: "account",
          targetId: dto.id,
          result: "succeeded",
          metadata: {},
        },
        transaction,
      );
    });
  }

  /** 在任何账户规则读取或写入前获取同一事务的记账组织锁。 */
  private async lockOrganization(organizationId: string, executor: AppDbExecutor): Promise<void> {
    const locked = await this.writeLockRepository.lockOrganization(organizationId, executor);
    if (!locked) throw this.notFound();
  }

  /** 将数据库账户记录映射为不暴露组织和审计字段的客户端摘要。 */
  private toSummary(row: AccountListRecord): AccountSummary {
    if (!Number.isSafeInteger(row.balanceMinor)) {
      throw new Error("Account balance exceeds the JavaScript safe integer range");
    }

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      icon: row.icon,
      color: row.color,
      sortOrder: row.sortOrder,
      balanceMinor: row.balanceMinor,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** 创建不泄露资源存在性的账户未找到异常。 */
  private notFound(): NotFoundException {
    return new NotFoundException({ code: apiErrorCodes.notFound, message: "账户不存在" });
  }
}
