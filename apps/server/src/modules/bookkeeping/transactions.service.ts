import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { TransactionPage, TransactionRecord, UpsertTransactionRequest } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { DatabaseTransactionService } from "../../db/database-transaction.service.js";
import type { AppDbExecutor } from "../../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AccountsRepository } from "./accounts.repository.js";
import { BookkeepingWriteLockRepository } from "./bookkeeping-write-lock.repository.js";
import { CategoriesRepository } from "./categories.repository.js";
import type { CreateTransactionDto } from "./dto/create-transaction.dto.js";
import type { DeleteTransactionDto } from "./dto/delete-transaction.dto.js";
import type { ListTransactionsDto } from "./dto/list-transactions.dto.js";
import type { TransactionDetailDto } from "./dto/transaction-detail.dto.js";
import type { UpdateTransactionDto } from "./dto/update-transaction.dto.js";
import {
  buildTransactionAccountLockIds,
  hasExactLockedAccounts,
} from "./transaction-account-locks.js";
import { toOccurredOn } from "./transaction-date.js";
import { buildMovements, type TransactionMovement } from "./transaction-movements.js";
import { TransactionsRepository } from "./transactions.repository.js";
import type { LockedOrganizationContext, TransactionWriteInput } from "./transactions.types.js";

type ValidatedWrite = { write: TransactionWriteInput; movements: TransactionMovement[] };

const updateAuditFields = [
  "ledgerId",
  "type",
  "accountId",
  "destinationAccountId",
  "categoryId",
  "amountMinor",
  "occurredAt",
  "payee",
  "note",
];

/** 承担普通交易的组织隔离、业务校验、并发锁、事务与必需审计。 */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly repository: TransactionsRepository,
    private readonly accountsRepository: AccountsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly writeLockRepository: BookkeepingWriteLockRepository,
    private readonly auditService: AuditService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  /** 列出当前组织有效普通交易，筛选和分页均由已校验 DTO 提供。 */
  list(authContext: AuthContext, dto: ListTransactionsDto): Promise<TransactionPage> {
    return this.repository.list(authContext.organizationId, dto);
  }

  /** 查询当前组织有效普通交易详情；跨组织、已删除及内部交易统一返回未找到。 */
  async detail(authContext: AuthContext, dto: TransactionDetailDto): Promise<TransactionRecord> {
    const record = await this.repository.findDetail(authContext.organizationId, dto.id);
    if (!record) throw this.notFound("交易不存在");

    return record;
  }

  /**
   * 创建普通交易、全部流水与必需审计，并在一个数据库事务内提交。
   * 任何账本、账户、分类及组织配置读取前先锁组织行，防止分类规则或币种并发变化。
   */
  create(authContext: AuthContext, dto: CreateTransactionDto): Promise<TransactionRecord> {
    return this.transactions.run(async (transaction) => {
      const context = await this.lockOrganizationContext(authContext.organizationId, transaction);
      const validated = await this.validateWrite(authContext, dto, context, transaction);
      const id = await this.repository.create(validated.write, validated.movements, transaction);
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "transaction.created",
          targetType: "transaction",
          targetId: id,
          result: "succeeded",
          metadata: { ledgerId: dto.ledgerId, type: dto.type },
        },
        transaction,
      );

      return this.requireWrittenDetail(authContext.organizationId, id, transaction);
    });
  }

  /**
   * 锁定并完整更新普通交易，随后只重建该交易流水并追加必需审计。
   * @throws NotFoundException 交易、账本、账户或分类跨组织、已删除或不存在时抛出。
   */
  update(authContext: AuthContext, dto: UpdateTransactionDto): Promise<TransactionRecord> {
    return this.transactions.run(async (transaction) => {
      await this.lockOrganization(authContext.organizationId, transaction);
      const current = await this.repository.findActiveOwnedForUpdate(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      if (!current) throw this.notFound("交易不存在");
      await this.requirePersonalLedger(authContext.organizationId, current.ledgerId, transaction);
      const context = await this.requireOrganizationContext(
        authContext.organizationId,
        transaction,
      );
      const validated = await this.validateWrite(authContext, dto, context, transaction);
      await this.repository.update(
        { ...validated.write, id: dto.id },
        validated.movements,
        transaction,
      );
      await this.auditService.appendRequired(
        {
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          action: "transaction.updated",
          targetType: "transaction",
          targetId: dto.id,
          result: "succeeded",
          metadata: { type: dto.type, changedFields: updateAuditFields },
        },
        transaction,
      );

      return this.requireWrittenDetail(authContext.organizationId, dto.id, transaction);
    });
  }

  /** 软删除交易表头并追加必需审计；账户流水保留且不再参与有效聚合。 */
  delete(authContext: AuthContext, dto: DeleteTransactionDto): Promise<void> {
    return this.transactions.run(async (transaction) => {
      await this.lockOrganization(authContext.organizationId, transaction);
      const current = await this.repository.findActiveOwnedForUpdate(
        authContext.organizationId,
        dto.id,
        transaction,
      );
      if (!current) throw this.notFound("交易不存在");
      await this.requirePersonalLedger(authContext.organizationId, current.ledgerId, transaction);

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
          action: "transaction.deleted",
          targetType: "transaction",
          targetId: dto.id,
          result: "succeeded",
          metadata: { type: current.type },
        },
        transaction,
      );
    });
  }

  /** 在任何交易写规则读取前获取所有记账写路径共享的组织锁。 */
  private async lockOrganization(organizationId: string, executor: AppDbExecutor): Promise<void> {
    const locked = await this.writeLockRepository.lockOrganization(organizationId, executor);
    if (!locked) throw this.notFound("组织不存在");
  }

  /** 获取组织锁后读取并校验稳定的基础币种及时区配置。 */
  private async lockOrganizationContext(
    organizationId: string,
    executor: AppDbExecutor,
  ): Promise<LockedOrganizationContext> {
    await this.lockOrganization(organizationId, executor);
    return this.requireOrganizationContext(organizationId, executor);
  }

  /** 读取组织锁保护下的记账配置，并拒绝损坏的币种配置。 */
  private async requireOrganizationContext(
    organizationId: string,
    executor: AppDbExecutor,
  ): Promise<LockedOrganizationContext> {
    const context = await this.repository.findLockedOrganizationContext(organizationId, executor);
    if (!context) throw this.notFound("组织不存在");
    if (!/^[A-Z]{3}$/.test(context.baseCurrency)) {
      throw new Error("Organization base currency is invalid");
    }

    return context;
  }

  /** 校验活动资源、分类形态、金额和时区日期，并形成可信持久化输入。 */
  private async validateWrite(
    authContext: AuthContext,
    dto: UpsertTransactionRequest,
    context: LockedOrganizationContext,
    executor: AppDbExecutor,
  ): Promise<ValidatedWrite> {
    let accountIds: string[];
    try {
      accountIds = buildTransactionAccountLockIds(dto);
    } catch (error) {
      throw this.badRequest(error instanceof Error ? error.message : "交易账户无效");
    }
    const lockedAccounts = await this.accountsRepository.findActiveOwnedAccountsForUpdate(
      authContext.organizationId,
      accountIds,
      executor,
    );
    if (!hasExactLockedAccounts(accountIds, lockedAccounts)) {
      throw this.notFound("账户不存在");
    }

    await this.requirePersonalLedger(authContext.organizationId, dto.ledgerId, executor);

    await this.validateCategory(authContext.organizationId, dto, executor);
    let movements: TransactionMovement[];
    try {
      movements = buildMovements(dto);
    } catch (error) {
      throw this.badRequest(error instanceof Error ? error.message : "交易流水无效");
    }

    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw this.badRequest("交易发生时间无效");

    return {
      write: {
        organizationId: authContext.organizationId,
        ledgerId: dto.ledgerId,
        type: dto.type,
        categoryId: dto.categoryId ?? null,
        amountMinor: dto.amountMinor,
        occurredAt,
        occurredOn: toOccurredOn(occurredAt, context.timezone),
        payee: dto.payee ?? null,
        note: dto.note ?? null,
        actorUserId: authContext.userId,
      },
      movements,
    };
  }

  /** 验证收入/支出分类的组织、账本、类型和软删除边界。 */
  private async validateCategory(
    organizationId: string,
    dto: UpsertTransactionRequest,
    executor: AppDbExecutor,
  ): Promise<void> {
    if (dto.type === "transfer") {
      if (dto.categoryId !== undefined) throw this.badRequest("转账不能选择分类");
      return;
    }

    if (!dto.categoryId) throw this.badRequest("收入和支出必须选择分类");
    const category = await this.categoriesRepository.findActiveOwnedCategory(
      organizationId,
      dto.categoryId,
      executor,
    );
    if (!category) throw this.notFound("分类不存在");
    if (category.ledgerId !== dto.ledgerId || category.type !== dto.type) {
      throw this.badRequest("分类必须与交易账本和收支类型匹配");
    }
  }

  /** 确认账本属于当前组织后拒绝租赁账本，保留跨组织资源的未找到语义。 */
  private async requirePersonalLedger(
    organizationId: string,
    ledgerId: string,
    executor: AppDbExecutor,
  ): Promise<void> {
    const ledger = await this.categoriesRepository.findActiveOwnedLedger(
      organizationId,
      ledgerId,
      executor,
    );
    if (!ledger) throw this.notFound("账本不存在");
    if (ledger.type === "rental") throw this.badRequest("租赁账本不能使用普通交易管理");
  }

  /** 读取刚写入的交易响应；失败将令外层事务回滚。 */
  private async requireWrittenDetail(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<TransactionRecord> {
    const record = await this.repository.findDetail(organizationId, id, executor);
    if (!record) throw new Error("Written transaction is unavailable");

    return record;
  }

  /** 创建输入语义不合法异常。 */
  private badRequest(message: string): BadRequestException {
    return new BadRequestException({ code: apiErrorCodes.validationFailed, message });
  }

  /** 创建不泄露资源存在性的未找到异常。 */
  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: apiErrorCodes.notFound, message });
  }
}
