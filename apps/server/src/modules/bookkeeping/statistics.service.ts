import { Injectable, NotFoundException } from "@nestjs/common";
import type { MonthlyExpenseCategoryStatistics, MonthlyStatistics } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { MonthlyStatisticsDto } from "./dto/monthly-statistics.dto.js";
import type { MonthlyAggregateRow } from "./statistics.repository.js";
import { StatisticsRepository } from "./statistics.repository.js";
import { toCalendarMonthRange } from "./statistics-month.js";

const maximumSafeMinor = BigInt(Number.MAX_SAFE_INTEGER);

/** 将 PostgreSQL 聚合金额严格解析为非负 bigint，不提前转换为 Number。 */
function toAggregateMinor(value: unknown): bigint {
  let integer: bigint;
  if (typeof value === "bigint") {
    integer = value;
  } else if (typeof value === "string") {
    if (!/^(0|[1-9]\d*)$/.test(value)) {
      throw new Error("Invalid monthly aggregate amount");
    }
    integer = BigInt(value);
  } else {
    throw new Error("Invalid monthly aggregate amount");
  }

  if (integer < 0n || integer > maximumSafeMinor) {
    throw new Error("Invalid monthly aggregate amount");
  }
  return integer;
}

/** 累加一个聚合金额，并在每一步拒绝超过 JavaScript 安全整数范围的结果。 */
function addSafeAggregateMinor(total: bigint, amount: bigint): bigint {
  const next = total + amount;
  if (next > maximumSafeMinor) throw new Error("Invalid monthly aggregate amount");
  return next;
}

/** 按百分数两位小数做确定性的正数 half-up 舍入；零支出返回零。 */
function toExpensePercentage(amountMinor: bigint, expenseMinor: bigint): number {
  if (expenseMinor === 0n) return 0;
  const hundredths = (amountMinor * 10_000n + expenseMinor / 2n) / expenseMinor;
  return Number(hundredths) / 100;
}

type ExpenseCategoryAggregate = {
  categoryId: string;
  categoryName: string;
  amountMinor: bigint;
};

/** 将同一快照的分组行累加为收入、支出及去重后的支出分类。 */
function aggregateMonthlyRows(rows: MonthlyAggregateRow[]): {
  incomeMinor: bigint;
  expenseMinor: bigint;
  expenseCategories: ExpenseCategoryAggregate[];
} {
  let incomeMinor = 0n;
  let expenseMinor = 0n;
  const categoryById = new Map<string, ExpenseCategoryAggregate>();

  for (const row of rows) {
    const amountMinor = toAggregateMinor(row.amountMinor);
    if (row.type === "income") {
      incomeMinor = addSafeAggregateMinor(incomeMinor, amountMinor);
      continue;
    }
    if (row.type !== "expense") throw new Error("Invalid monthly aggregate type");

    expenseMinor = addSafeAggregateMinor(expenseMinor, amountMinor);
    const current = categoryById.get(row.categoryId);
    categoryById.set(row.categoryId, {
      categoryId: row.categoryId,
      categoryName: current?.categoryName ?? row.categoryName,
      amountMinor: addSafeAggregateMinor(current?.amountMinor ?? 0n, amountMinor),
    });
  }

  return {
    incomeMinor,
    expenseMinor,
    expenseCategories: [...categoryById.values()].sort((left, right) => {
      if (left.amountMinor !== right.amountMinor)
        return left.amountMinor > right.amountMinor ? -1 : 1;
      if (left.categoryName !== right.categoryName)
        return left.categoryName < right.categoryName ? -1 : 1;
      return left.categoryId < right.categoryId ? -1 : left.categoryId === right.categoryId ? 0 : 1;
    }),
  };
}

/** 将支出分类 bigint 聚合转换为共享响应类型。 */
function toExpenseCategories(
  categories: ExpenseCategoryAggregate[],
  expenseMinor: bigint,
): MonthlyExpenseCategoryStatistics[] {
  return categories.map((category) => ({
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    amountMinor: Number(category.amountMinor),
    percentage: toExpensePercentage(category.amountMinor, expenseMinor),
  }));
}

/** 提供组织隔离、账本有效性校验及安全金额映射的月度统计。 */
@Injectable()
export class StatisticsService {
  constructor(private readonly repository: StatisticsRepository) {}

  /**
   * 返回当前组织指定公历月的基础币种、收支、结余与支出分类占比。
   * 省略账本时覆盖组织全部账本；指定账本跨组织或已软删除时返回未找到。
   */
  async monthly(authContext: AuthContext, dto: MonthlyStatisticsDto): Promise<MonthlyStatistics> {
    const organizationId = authContext.organizationId;
    const organization = await this.repository.findOrganizationCurrency(organizationId);
    if (!organization) throw this.notFound("组织不存在");
    if (!/^[A-Z]{3}$/.test(organization.baseCurrency)) {
      throw new Error("Organization base currency is invalid");
    }

    if (dto.ledgerId) {
      const ledger = await this.repository.findActiveOwnedLedger(organizationId, dto.ledgerId);
      if (!ledger) throw this.notFound("账本不存在");
    }

    const rows = await this.repository.aggregateMonthly(organizationId, {
      ...toCalendarMonthRange(dto.month),
      ...(dto.ledgerId ? { ledgerId: dto.ledgerId } : {}),
    });
    const aggregate = aggregateMonthlyRows(rows);
    const netMinor = aggregate.incomeMinor - aggregate.expenseMinor;
    if (netMinor < -maximumSafeMinor || netMinor > maximumSafeMinor) {
      throw new Error("Invalid monthly aggregate amount");
    }

    return {
      currency: organization.baseCurrency,
      incomeMinor: Number(aggregate.incomeMinor),
      expenseMinor: Number(aggregate.expenseMinor),
      netMinor: Number(netMinor),
      expenseCategories: toExpenseCategories(aggregate.expenseCategories, aggregate.expenseMinor),
    };
  }

  /** 创建统一未找到异常，避免泄露跨组织资源存在性。 */
  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: apiErrorCodes.notFound, message });
  }
}
