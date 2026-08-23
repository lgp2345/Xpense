import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import {
  accountMovements,
  accounts,
  ledgers,
  organizations,
  transactions,
} from "../../db/schema.js";
import { buildActiveAccountSummaryQuery, buildActiveAccountsQuery } from "./accounts.queries.js";
import { accountRecordFields } from "./accounts.repository.select-fields.js";
import type {
  AccountListRecord,
  AccountRecord,
  CreateAccountInput,
  DefaultLedgerContext,
  OpeningBalanceWriteInput,
  SoftDeleteAccountInput,
  UpdateAccountInput,
} from "./bookkeeping.types.js";

/** 负责账户、期初余额交易及账户流水的持久化。 */
@Injectable()
export class AccountsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /**
   * 查询组织内未软删除账户及其有效交易派生余额。
   * @param organizationId 当前认证组织 ID。
   */
  listActive(organizationId: string): Promise<AccountListRecord[]> {
    return buildActiveAccountsQuery(this.db, organizationId);
  }

  /**
   * 查询组织内一个未软删除账户及其派生余额。
   * @param organizationId 当前认证组织 ID。
   * @param id 账户 ID。
   * @param executor 可选的同一事务执行器。
   */
  async findActiveSummary(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<AccountListRecord | null> {
    const [account] = await buildActiveAccountSummaryQuery(executor, organizationId, id);

    return account ?? null;
  }

  /**
   * 查询组织所属且未软删除的账户。
   * @param organizationId 当前认证组织 ID。
   * @param id 账户 ID。
   * @param executor 可选的同一事务执行器；交易写入必须传入事务执行器。
   * @returns 账户；跨组织或已删除时返回 null。
   */
  async findActiveOwnedAccount(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<AccountRecord | null> {
    const [account] = await executor
      .select(accountRecordFields)
      .from(accounts)
      .where(
        and(
          eq(accounts.organizationId, organizationId),
          eq(accounts.id, id),
          isNull(accounts.deletedAt),
        ),
      )
      .limit(1);

    return account ?? null;
  }

  /**
   * 创建组织级账户。
   * @param input 账户字段与可信创建人。
   * @param executor 同一业务事务执行器。
   */
  async create(
    input: CreateAccountInput,
    executor: AppDbExecutor = this.db,
  ): Promise<AccountRecord> {
    const [account] = await executor.insert(accounts).values(input).returning(accountRecordFields);

    if (!account) {
      throw new Error("Failed to create account");
    }

    return account;
  }

  /**
   * 更新组织内未软删除账户。
   * @param input 可变账户字段。
   * @param executor 同一业务事务执行器。
   */
  async update(
    input: UpdateAccountInput,
    executor: AppDbExecutor = this.db,
  ): Promise<AccountRecord> {
    const [account] = await executor
      .update(accounts)
      .set({
        name: input.name,
        type: input.type,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(accounts.organizationId, input.organizationId),
          eq(accounts.id, input.id),
          isNull(accounts.deletedAt),
        ),
      )
      .returning(accountRecordFields);

    if (!account) {
      throw new Error("Failed to update active account");
    }

    return account;
  }

  /**
   * 软删除组织内账户并记录删除人。
   * @param input 组织、账户及可信删除人。
   * @param executor 同一业务事务执行器。
   */
  async softDelete(
    input: SoftDeleteAccountInput,
    executor: AppDbExecutor = this.db,
  ): Promise<void> {
    const now = new Date();
    await executor
      .update(accounts)
      .set({ deletedAt: now, deletedByUserId: input.deletedByUserId, updatedAt: now })
      .where(
        and(
          eq(accounts.organizationId, input.organizationId),
          eq(accounts.id, input.id),
          isNull(accounts.deletedAt),
        ),
      );
  }

  /**
   * 查询组织的有效默认个人账本及时区。
   * @param organizationId 当前认证组织 ID。
   * @param executor 同一账户创建事务执行器。
   */
  async findDefaultLedgerContext(
    organizationId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<DefaultLedgerContext | null> {
    const [context] = await executor
      .select({ ledgerId: ledgers.id, timezone: organizations.timezone })
      .from(ledgers)
      .innerJoin(organizations, eq(organizations.id, ledgers.organizationId))
      .where(
        and(
          eq(ledgers.organizationId, organizationId),
          eq(ledgers.type, "personal"),
          eq(ledgers.isDefault, true),
          isNull(ledgers.deletedAt),
        ),
      )
      .limit(1);

    return context ?? null;
  }

  /**
   * 在同一事务内直写一笔排除型期初交易和一条有符号流水。
   * @param input 已归一化的期初余额交易数据。
   * @param executor 账户创建事务执行器。
   */
  async writeOpeningBalance(
    input: OpeningBalanceWriteInput,
    executor: AppDbExecutor,
  ): Promise<string> {
    const [transaction] = await executor
      .insert(transactions)
      .values({
        organizationId: input.organizationId,
        ledgerId: input.ledgerId,
        type: input.type,
        categoryId: null,
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        occurredOn: input.occurredOn,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
      })
      .returning({ id: transactions.id });

    if (!transaction) {
      throw new Error("Failed to create opening balance transaction");
    }

    await executor.insert(accountMovements).values({
      organizationId: input.organizationId,
      transactionId: transaction.id,
      accountId: input.accountId,
      amountMinor: input.movementAmountMinor,
    });

    return transaction.id;
  }
}
