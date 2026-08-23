import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { AppDb } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { ledgers, organizations } from "../../db/schema.js";
import { buildMonthlyAggregateQuery, type MonthlyAggregateScope } from "./statistics.queries.js";

/** PostgreSQL `SUM(bigint)` 返回的未信任金额表示。 */
export type AggregateAmount = string | bigint;

/** 单条 SQL 返回的月度类型及分类聚合行。 */
export type MonthlyAggregateRow = {
  type: "income" | "expense";
  categoryId: string;
  categoryName: string;
  amountMinor: AggregateAmount;
};

/** 负责月度统计配置、账本边界与单条分组聚合查询。 */
@Injectable()
export class StatisticsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** 读取当前组织基础币种；组织不存在时返回空。 */
  async findOrganizationCurrency(organizationId: string): Promise<{ baseCurrency: string } | null> {
    const [organization] = await this.db
      .select({ baseCurrency: organizations.baseCurrency })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    return organization ?? null;
  }

  /** 查询当前组织内未软删除的指定账本，跨组织和已删除账本统一返回空。 */
  async findActiveOwnedLedger(
    organizationId: string,
    ledgerId: string,
  ): Promise<{ id: string } | null> {
    const [ledger] = await this.db
      .select({ id: ledgers.id })
      .from(ledgers)
      .where(
        and(
          eq(ledgers.organizationId, organizationId),
          eq(ledgers.id, ledgerId),
          isNull(ledgers.deletedAt),
        ),
      )
      .limit(1);

    return ledger ?? null;
  }

  /** 执行单条分组聚合查询，使收支总额和分类明细共享同一数据库语句快照。 */
  async aggregateMonthly(
    organizationId: string,
    scope: MonthlyAggregateScope,
  ): Promise<MonthlyAggregateRow[]> {
    const rows = await buildMonthlyAggregateQuery(this.db, organizationId, scope);
    return rows as MonthlyAggregateRow[];
  }
}
