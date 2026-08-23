import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { accountMovements, accounts, transactions } from "../../db/schema.js";
import {
  accountRecordFields,
  accountSummaryFields,
  accountSummaryGroupFields,
} from "./accounts.repository.select-fields.js";

type AccountSelectExecutor = Pick<AppDbExecutor, "select">;

/**
 * 构建组织内活动账户的稳定批量行锁查询。
 * @param executor 当前交易写事务执行器。
 * @param organizationId 可信认证组织 ID。
 * @param ids 待锁账户 ID；函数去重并按 ID 升序，避免转账双账户反向锁导致死锁。
 * @returns 使用 `FOR UPDATE` 的可执行 Drizzle 查询。
 */
export function buildActiveAccountsForUpdateQuery(
  executor: AccountSelectExecutor,
  organizationId: string,
  ids: string[],
) {
  const stableIds = [...new Set(ids)].sort();

  return executor
    .select(accountRecordFields)
    .from(accounts)
    .where(
      and(
        eq(accounts.organizationId, organizationId),
        inArray(accounts.id, stableIds),
        isNull(accounts.deletedAt),
      ),
    )
    .orderBy(asc(accounts.id))
    .for("update");
}

/**
 * 构建组织内有效账户及有效交易派生余额的列表查询。
 * @param executor 数据库或事务查询执行器。
 * @param organizationId 当前认证组织 ID；同时约束账户、流水及交易连接。
 * @returns 可执行或可通过 `toSQL` 检查的 Drizzle 查询。
 */
export function buildActiveAccountsQuery(executor: AccountSelectExecutor, organizationId: string) {
  return executor
    .select(accountSummaryFields)
    .from(accounts)
    .leftJoin(
      accountMovements,
      and(
        eq(accountMovements.organizationId, organizationId),
        eq(accountMovements.accountId, accounts.id),
      ),
    )
    .leftJoin(
      transactions,
      and(
        eq(transactions.organizationId, organizationId),
        eq(transactions.id, accountMovements.transactionId),
      ),
    )
    .where(and(eq(accounts.organizationId, organizationId), isNull(accounts.deletedAt)))
    .groupBy(...accountSummaryGroupFields)
    .orderBy(asc(accounts.sortOrder), asc(accounts.createdAt));
}

/**
 * 构建组织内单个有效账户及有效交易派生余额的查询。
 * @param executor 数据库或事务查询执行器；调用方传入事务时不会回退到默认连接。
 * @param organizationId 当前认证组织 ID；同时约束账户、流水及交易连接。
 * @param id 账户 ID。
 * @returns 最多一行且可通过 `toSQL` 检查的 Drizzle 查询。
 */
export function buildActiveAccountSummaryQuery(
  executor: AccountSelectExecutor,
  organizationId: string,
  id: string,
) {
  return executor
    .select(accountSummaryFields)
    .from(accounts)
    .leftJoin(
      accountMovements,
      and(
        eq(accountMovements.organizationId, organizationId),
        eq(accountMovements.accountId, accounts.id),
      ),
    )
    .leftJoin(
      transactions,
      and(
        eq(transactions.organizationId, organizationId),
        eq(transactions.id, accountMovements.transactionId),
      ),
    )
    .where(
      and(
        eq(accounts.organizationId, organizationId),
        eq(accounts.id, id),
        isNull(accounts.deletedAt),
      ),
    )
    .groupBy(...accountSummaryGroupFields)
    .limit(1);
}
