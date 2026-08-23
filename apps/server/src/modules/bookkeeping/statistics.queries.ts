import { and, asc, desc, eq, gte, inArray, isNull, lte, type SQL, sql } from "drizzle-orm";

import type { AppDbExecutor } from "../../db/db.module.js";
import { categories, transactions } from "../../db/schema.js";

export const uncategorizedCategoryId = "uncategorized";
export const uncategorizedCategoryName = "未分类";

/** 月度聚合查询的组织、日期及可选账本范围。 */
export type MonthlyAggregateScope = {
  firstDay: string;
  lastDay: string;
  ledgerId?: string;
};

type StatisticsSelectExecutor = Pick<AppDbExecutor, "select">;

/** 构建月度聚合的组织、软删除、日期和可选账本条件。 */
function buildMonthlyScopeConditions(organizationId: string, scope: MonthlyAggregateScope): SQL[] {
  const conditions: SQL[] = [
    eq(transactions.organizationId, organizationId),
    isNull(transactions.deletedAt),
    gte(transactions.occurredOn, scope.firstDay),
    lte(transactions.occurredOn, scope.lastDay),
  ];
  if (scope.ledgerId) conditions.push(eq(transactions.ledgerId, scope.ledgerId));

  return conditions;
}

/**
 * 构建收入及支出按类型和分类分组的单条月度聚合查询。
 * 单语句保证总额与支出分类来自同一数据库快照；分类连接不筛选 `deletedAt`，历史名称得以保留。
 */
export function buildMonthlyAggregateQuery(
  executor: StatisticsSelectExecutor,
  organizationId: string,
  scope: MonthlyAggregateScope,
) {
  const amountMinor = sql<string>`COALESCE(SUM(${transactions.amountMinor}), 0)`;

  return executor
    .select({
      type: transactions.type,
      categoryId: sql<string>`COALESCE(${categories.id}::text, ${uncategorizedCategoryId})`,
      categoryName: sql<string>`COALESCE(${categories.name}, ${uncategorizedCategoryName})`,
      amountMinor,
    })
    .from(transactions)
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
        ...buildMonthlyScopeConditions(organizationId, scope),
        inArray(transactions.type, ["income", "expense"]),
      ),
    )
    .groupBy(transactions.type, categories.id, categories.name)
    .orderBy(asc(transactions.type), desc(amountMinor), asc(categories.name), asc(categories.id));
}
