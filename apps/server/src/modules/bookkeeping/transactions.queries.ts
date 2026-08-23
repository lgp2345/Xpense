import { transactionTypes } from "@xpense/shared";
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { accountMovements, accounts, categories, ledgers, transactions } from "../../db/schema.js";
import type { TransactionListInput } from "./transactions.types.js";

const transactionHeaderFields = {
  id: transactions.id,
  ledgerId: transactions.ledgerId,
  ledgerName: ledgers.name,
  type: transactions.type,
  categoryId: transactions.categoryId,
  categoryName: categories.name,
  amountMinor: transactions.amountMinor,
  occurredAt: transactions.occurredAt,
  payee: transactions.payee,
  note: transactions.note,
  createdAt: transactions.createdAt,
  updatedAt: transactions.updatedAt,
};

/** 构建列表与计数共用的组织、软删除及业务筛选条件。 */
function buildTransactionConditions(
  executor: AppDbExecutor,
  organizationId: string,
  input: TransactionListInput,
): SQL[] {
  const conditions: SQL[] = [
    eq(transactions.organizationId, organizationId),
    isNull(transactions.deletedAt),
    inArray(transactions.type, transactionTypes),
  ];

  if (input.ledgerId) conditions.push(eq(transactions.ledgerId, input.ledgerId));
  if (input.categoryId) conditions.push(eq(transactions.categoryId, input.categoryId));
  if (input.type) conditions.push(eq(transactions.type, input.type));
  if (input.keyword) {
    const keyword = `%${input.keyword}%`;
    const keywordCondition = or(
      ilike(transactions.payee, keyword),
      ilike(transactions.note, keyword),
    );
    if (keywordCondition) conditions.push(keywordCondition);
  }
  if (input.from) conditions.push(gte(transactions.occurredOn, input.from));
  if (input.to) conditions.push(lte(transactions.occurredOn, input.to));
  if (input.accountId) {
    conditions.push(
      exists(
        executor
          .select({ id: accountMovements.id })
          .from(accountMovements)
          .where(
            and(
              eq(accountMovements.organizationId, organizationId),
              eq(accountMovements.transactionId, transactions.id),
              eq(accountMovements.accountId, input.accountId),
            ),
          ),
      ),
    );
  }

  return conditions;
}

/** 构建交易分页条目查询；历史账本和分类名称不受其软删除状态影响。 */
export function buildTransactionListQuery(
  executor: AppDbExecutor,
  organizationId: string,
  input: TransactionListInput,
) {
  return executor
    .select(transactionHeaderFields)
    .from(transactions)
    .innerJoin(
      ledgers,
      and(
        eq(ledgers.organizationId, transactions.organizationId),
        eq(ledgers.id, transactions.ledgerId),
      ),
    )
    .leftJoin(
      categories,
      and(
        eq(categories.organizationId, transactions.organizationId),
        eq(categories.ledgerId, transactions.ledgerId),
        eq(categories.id, transactions.categoryId),
      ),
    )
    .where(and(...buildTransactionConditions(executor, organizationId, input)))
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
}

/** 构建与条目查询使用完全相同条件的总数查询。 */
export function buildTransactionCountQuery(
  executor: AppDbExecutor,
  organizationId: string,
  input: TransactionListInput,
) {
  return executor
    .select({ total: count() })
    .from(transactions)
    .where(and(...buildTransactionConditions(executor, organizationId, input)));
}

/** 批量读取当前页全部交易流水及账户名称，避免逐交易查询。 */
export function buildTransactionMovementsQuery(
  executor: AppDbExecutor,
  organizationId: string,
  transactionIds: string[],
) {
  return executor
    .select({
      transactionId: accountMovements.transactionId,
      accountId: accountMovements.accountId,
      accountName: accounts.name,
      amountMinor: accountMovements.amountMinor,
    })
    .from(accountMovements)
    .innerJoin(
      accounts,
      and(
        eq(accounts.organizationId, accountMovements.organizationId),
        eq(accounts.id, accountMovements.accountId),
      ),
    )
    .where(
      and(
        eq(accountMovements.organizationId, organizationId),
        inArray(accountMovements.transactionId, transactionIds),
      ),
    )
    .orderBy(accountMovements.createdAt, accountMovements.id);
}

/** 构建一个组织内有效普通交易的详情表头查询。 */
export function buildTransactionDetailQuery(
  executor: AppDbExecutor,
  organizationId: string,
  transactionId: string,
) {
  return executor
    .select(transactionHeaderFields)
    .from(transactions)
    .innerJoin(
      ledgers,
      and(
        eq(ledgers.organizationId, transactions.organizationId),
        eq(ledgers.id, transactions.ledgerId),
      ),
    )
    .leftJoin(
      categories,
      and(
        eq(categories.organizationId, transactions.organizationId),
        eq(categories.ledgerId, transactions.ledgerId),
        eq(categories.id, transactions.categoryId),
      ),
    )
    .where(
      and(
        eq(transactions.organizationId, organizationId),
        eq(transactions.id, transactionId),
        isNull(transactions.deletedAt),
        inArray(transactions.type, transactionTypes),
      ),
    )
    .limit(1);
}
