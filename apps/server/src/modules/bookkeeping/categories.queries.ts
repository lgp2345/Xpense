import { and, eq } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { categories, transactions } from "../../db/schema.js";

/** 构造包含软删除历史的分类子级存在性查询。 */
export function buildAnyCategoryChildrenQuery(
  executor: AppDbExecutor,
  organizationId: string,
  parentId: string,
) {
  return executor
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.organizationId, organizationId), eq(categories.parentId, parentId)))
    .limit(1);
}

/** 构造包含软删除历史的交易分类引用存在性查询。 */
export function buildAnyCategoryTransactionReferenceQuery(
  executor: AppDbExecutor,
  organizationId: string,
  categoryId: string,
) {
  return executor
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(eq(transactions.organizationId, organizationId), eq(transactions.categoryId, categoryId)),
    )
    .limit(1);
}
