import { Inject, Injectable } from "@nestjs/common";
import { type TransactionPage, type TransactionRecord, transactionTypes } from "@xpense/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { accountMovements, organizations, transactions } from "../../db/schema.js";
import type { TransactionMovement } from "./transaction-movements.js";
import {
  buildTransactionCountQuery,
  buildTransactionDetailQuery,
  buildTransactionListQuery,
  buildTransactionMovementsQuery,
} from "./transactions.queries.js";
import { assembleTransactionRecords } from "./transactions.records.js";
import type {
  LockedOrganizationContext,
  LockedTransactionRecord,
  SoftDeleteTransactionInput,
  TransactionHeaderRow,
  TransactionListInput,
  TransactionMovementRow,
  TransactionWriteInput,
} from "./transactions.types.js";

/** 负责普通交易分页、详情、表头、流水及软删除的持久化。 */
@Injectable()
export class TransactionsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** 查询当前组织有效普通交易并批量补齐账户流水。 */
  async list(organizationId: string, input: TransactionListInput): Promise<TransactionPage> {
    const [headers, totals] = await Promise.all([
      buildTransactionListQuery(this.db, organizationId, input),
      buildTransactionCountQuery(this.db, organizationId, input),
    ]);
    const movements = await this.loadMovements(
      organizationId,
      headers.map((header) => header.id),
      this.db,
    );

    return {
      items: assembleTransactionRecords(
        headers as TransactionHeaderRow[],
        movements as TransactionMovementRow[],
      ),
      total: totals[0]?.total ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  /** 查询当前组织一个有效普通交易详情，并保留历史资源名称。 */
  async findDetail(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<TransactionRecord | null> {
    const headers = await buildTransactionDetailQuery(executor, organizationId, id);
    const header = headers[0];
    if (!header) return null;
    const movements = await this.loadMovements(organizationId, [id], executor);

    return (
      assembleTransactionRecords(
        [header] as TransactionHeaderRow[],
        movements as TransactionMovementRow[],
      )[0] ?? null
    );
  }

  /**
   * 在组织行已由同一事务 `FOR UPDATE` 锁定后读取基础币种和时区。
   * 交易写与未来币种修改必须遵循相同组织锁顺序，使首笔交易与币种锁定规则可串行化。
   */
  async findLockedOrganizationContext(
    organizationId: string,
    executor: AppDbExecutor,
  ): Promise<LockedOrganizationContext | null> {
    const [context] = await executor
      .select({
        baseCurrency: organizations.baseCurrency,
        timezone: organizations.timezone,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    return context ?? null;
  }

  /** 在组织锁之后锁定并读取待更新或删除的有效普通交易。 */
  async findActiveOwnedForUpdate(
    organizationId: string,
    id: string,
    executor: AppDbExecutor,
  ): Promise<LockedTransactionRecord | null> {
    const [transaction] = await executor
      .select({ id: transactions.id, ledgerId: transactions.ledgerId, type: transactions.type })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, organizationId),
          eq(transactions.id, id),
          isNull(transactions.deletedAt),
          inArray(transactions.type, transactionTypes),
        ),
      )
      .for("update")
      .limit(1);

    return (transaction as LockedTransactionRecord | undefined) ?? null;
  }

  /** 在同一事务写入交易表头与全部有符号流水。 */
  async create(
    input: TransactionWriteInput,
    movements: TransactionMovement[],
    executor: AppDbExecutor,
  ): Promise<string> {
    const [transaction] = await executor
      .insert(transactions)
      .values({
        organizationId: input.organizationId,
        ledgerId: input.ledgerId,
        type: input.type,
        categoryId: input.categoryId,
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        occurredOn: input.occurredOn,
        payee: input.payee,
        note: input.note,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
      })
      .returning({ id: transactions.id });
    if (!transaction) throw new Error("Failed to create transaction");

    await executor.insert(accountMovements).values(
      movements.map((movement) => ({
        organizationId: input.organizationId,
        transactionId: transaction.id,
        ...movement,
      })),
    );

    return transaction.id;
  }

  /** 在同一事务更新表头，并仅重建目标交易自己的流水。 */
  async update(
    input: TransactionWriteInput & { id: string },
    movements: TransactionMovement[],
    executor: AppDbExecutor,
  ): Promise<void> {
    await executor
      .update(transactions)
      .set({
        ledgerId: input.ledgerId,
        type: input.type,
        categoryId: input.categoryId,
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        occurredOn: input.occurredOn,
        payee: input.payee,
        note: input.note,
        updatedByUserId: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(transactions.organizationId, input.organizationId),
          eq(transactions.id, input.id),
          isNull(transactions.deletedAt),
        ),
      );
    await executor
      .delete(accountMovements)
      .where(
        and(
          eq(accountMovements.organizationId, input.organizationId),
          eq(accountMovements.transactionId, input.id),
        ),
      );
    await executor.insert(accountMovements).values(
      movements.map((movement) => ({
        organizationId: input.organizationId,
        transactionId: input.id,
        ...movement,
      })),
    );
  }

  /** 仅软删除交易表头，保留历史流水且令其退出有效余额和统计。 */
  async softDelete(input: SoftDeleteTransactionInput, executor: AppDbExecutor): Promise<void> {
    const now = new Date();
    await executor
      .update(transactions)
      .set({ deletedAt: now, deletedByUserId: input.deletedByUserId, updatedAt: now })
      .where(
        and(
          eq(transactions.organizationId, input.organizationId),
          eq(transactions.id, input.id),
          isNull(transactions.deletedAt),
        ),
      );
  }

  /** 批量读取指定交易的全部流水与账户名称；空列表不会访问数据库。 */
  private loadMovements(
    organizationId: string,
    transactionIds: string[],
    executor: AppDbExecutor,
  ): Promise<TransactionMovementRow[]> {
    if (transactionIds.length === 0) return Promise.resolve([]);

    return buildTransactionMovementsQuery(executor, organizationId, transactionIds);
  }
}
