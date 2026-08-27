import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { ledgers, transactions } from "../../db/schema.js";
import type { LedgerRecord } from "./bookkeeping.types.js";

/** 负责账本的组织作用域查询及租赁账本受限持久化。 */
@Injectable()
export class LedgersRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /**
   * 查询组织内未软删除的账本。
   * @param organizationId 当前认证组织 ID。
   * @returns 默认账本优先、随后按创建顺序排列的账本。
   */
  listActive(organizationId: string): Promise<LedgerRecord[]> {
    return this.db
      .select({
        id: ledgers.id,
        name: ledgers.name,
        type: ledgers.type,
        isDefault: ledgers.isDefault,
        createdAt: ledgers.createdAt,
        updatedAt: ledgers.updatedAt,
      })
      .from(ledgers)
      .where(and(eq(ledgers.organizationId, organizationId), isNull(ledgers.deletedAt)))
      .orderBy(desc(ledgers.isDefault), asc(ledgers.createdAt));
  }

  /** 在调用方事务中创建不可作为默认账本的租赁账本。 */
  async createRental(
    input: { organizationId: string; name: string; createdByUserId: string },
    executor: AppDbExecutor,
  ): Promise<LedgerRecord> {
    const [ledger] = await executor
      .insert(ledgers)
      .values({ ...input, type: "rental", isDefault: false })
      .returning({
        id: ledgers.id,
        name: ledgers.name,
        type: ledgers.type,
        isDefault: ledgers.isDefault,
        createdAt: ledgers.createdAt,
        updatedAt: ledgers.updatedAt,
      });
    if (!ledger) throw new Error("Failed to create rental ledger");

    return ledger;
  }

  /** 只更新指定组织中尚未软删除的租赁账本。 */
  async renameActiveRental(
    input: { organizationId: string; id: string; name: string },
    executor: AppDbExecutor,
  ): Promise<boolean> {
    const [ledger] = await executor
      .update(ledgers)
      .set({ name: input.name, updatedAt: new Date() })
      .where(this.activeRentalCondition(input.organizationId, input.id))
      .returning({ id: ledgers.id });

    return ledger !== undefined;
  }

  /** 查询当前组织中尚未软删除的租赁账本，供调用方稳定映射资源不存在。 */
  async findActiveRental(
    organizationId: string,
    id: string,
    executor: AppDbExecutor = this.db,
  ): Promise<{ id: string } | null> {
    const [ledger] = await executor
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(this.activeRentalCondition(organizationId, id))
      .limit(1);

    return ledger ?? null;
  }

  /** 检查租赁账本是否被任意历史交易引用，包含已软删除交易。 */
  async hasAnyTransactionReference(
    organizationId: string,
    ledgerId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<boolean> {
    const [transaction] = await executor
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(eq(transactions.organizationId, organizationId), eq(transactions.ledgerId, ledgerId)),
      )
      .limit(1);

    return transaction !== undefined;
  }

  /** 只软删除指定组织中尚未软删除的租赁账本，并记录操作者。 */
  async softDeleteActiveRental(
    input: { organizationId: string; id: string; deletedByUserId: string },
    executor: AppDbExecutor,
  ): Promise<boolean> {
    const now = new Date();
    const [ledger] = await executor
      .update(ledgers)
      .set({ deletedAt: now, deletedByUserId: input.deletedByUserId, updatedAt: now })
      .where(this.activeRentalCondition(input.organizationId, input.id))
      .returning({ id: ledgers.id });

    return ledger !== undefined;
  }

  /** 生成租赁账本专用的组织、活动状态和类型边界。 */
  private activeRentalCondition(organizationId: string, id: string) {
    return and(
      eq(ledgers.organizationId, organizationId),
      eq(ledgers.id, id),
      eq(ledgers.type, "rental"),
      isNull(ledgers.deletedAt),
    );
  }
}
