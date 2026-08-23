import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { ledgers, organizations } from "../../db/schema.js";
import { buildMonthlyAggregateQuery } from "./statistics.queries.js";
import { StatisticsRepository } from "./statistics.repository.js";

const scope = {
  firstDay: "2026-08-01",
  lastDay: "2026-08-31",
  ledgerId: "ledger-1",
};

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function containsReference(
  value: unknown,
  reference: unknown,
  visited = new WeakSet<object>(),
): boolean {
  if (value === reference) return true;
  if (typeof value !== "object" || value === null) return false;
  if (visited.has(value)) return false;
  visited.add(value);
  return Object.values(value).some((item) => containsReference(item, reference, visited));
}

describe("statistics aggregate queries", () => {
  it("renders one grouped snapshot query for totals and historical expense categories", () => {
    const query = buildMonthlyAggregateQuery(
      new QueryBuilder() as never,
      "organization-1",
      scope,
    ).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain('coalesce(sum("transactions"."amount_minor"), 0)');
    expect(sql).toContain('from "transactions"');
    expect(sql).toContain('left join "categories"');
    expect(sql).toContain('"categories"."organization_id" = "transactions"."organization_id"');
    expect(sql).toContain('"categories"."ledger_id" = "transactions"."ledger_id"');
    expect(sql).toContain('"categories"."id" = "transactions"."category_id"');
    expect(sql).toContain('"transactions"."organization_id" =');
    expect(sql).toContain('"transactions"."deleted_at" is null');
    expect(sql).toContain('"transactions"."type" in');
    expect(sql).toContain('"transactions"."occurred_on" >=');
    expect(sql).toContain('"transactions"."occurred_on" <=');
    expect(sql).toContain('"transactions"."ledger_id" =');
    expect(sql).toContain('group by "transactions"."type", "categories"."id", "categories"."name"');
    expect(sql).not.toContain('"categories"."deleted_at"');
    expect(query.params).toEqual(
      expect.arrayContaining([
        "uncategorized",
        "未分类",
        "income",
        "expense",
        "organization-1",
        "2026-08-01",
        "2026-08-31",
        "ledger-1",
      ]),
    );
    for (const excludedType of ["transfer", "excluded_inflow", "excluded_outflow"]) {
      expect(query.params).not.toContain(excludedType);
    }
  });

  it("omits the ledger predicate when all organization ledgers are requested", () => {
    const query = buildMonthlyAggregateQuery(new QueryBuilder() as never, "organization-1", {
      firstDay: "2026-08-01",
      lastDay: "2026-08-31",
    }).toSQL();

    expect(normalizeSql(query.sql)).not.toContain('"transactions"."ledger_id" =');
    expect(query.params).not.toContain("ledger-1");
  });
});

describe("StatisticsRepository", () => {
  it("reads the organization currency and hides inactive, deleted, or foreign ledgers", async () => {
    const organizationLimit = vi.fn().mockResolvedValue([{ baseCurrency: "CNY" }]);
    const organizationWhere = vi.fn().mockReturnValue({ limit: organizationLimit });
    const organizationFrom = vi.fn().mockReturnValue({ where: organizationWhere });
    const ledgerLimit = vi.fn().mockResolvedValue([{ id: "ledger-1" }]);
    const ledgerWhere = vi.fn().mockReturnValue({ limit: ledgerLimit });
    const ledgerFrom = vi.fn().mockReturnValue({ where: ledgerWhere });
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: organizationFrom })
      .mockReturnValueOnce({ from: ledgerFrom });
    const repository = new StatisticsRepository({ select } as never);

    await expect(repository.findOrganizationCurrency("organization-1")).resolves.toEqual({
      baseCurrency: "CNY",
    });
    await expect(repository.findActiveOwnedLedger("organization-1", "ledger-1")).resolves.toEqual({
      id: "ledger-1",
    });

    expect(organizationFrom).toHaveBeenCalledWith(organizations);
    expect(ledgerFrom).toHaveBeenCalledWith(ledgers);
    const ledgerCondition = ledgerWhere.mock.calls[0]?.[0];
    expect(containsReference(ledgerCondition, ledgers.organizationId)).toBe(true);
    expect(containsReference(ledgerCondition, "organization-1")).toBe(true);
    expect(containsReference(ledgerCondition, ledgers.id)).toBe(true);
    expect(containsReference(ledgerCondition, "ledger-1")).toBe(true);
    expect(containsReference(ledgerCondition, ledgers.deletedAt)).toBe(true);
  });

  it("executes exactly one grouped aggregate query for one atomic monthly snapshot", async () => {
    const rows = [
      {
        type: "income",
        categoryId: "income-1",
        categoryName: "工资",
        amountMinor: "500000",
      },
      {
        type: "expense",
        categoryId: "category-1",
        categoryName: "居住",
        amountMinor: "120000",
      },
    ];
    const query: Record<string, unknown> = {};
    query.from = vi.fn().mockReturnValue(query);
    query.leftJoin = vi.fn().mockReturnValue(query);
    query.where = vi.fn().mockReturnValue(query);
    query.groupBy = vi.fn().mockReturnValue(query);
    query.orderBy = vi.fn().mockResolvedValue(rows);
    const select = vi.fn().mockReturnValue(query);
    const repository = new StatisticsRepository({ select } as never);

    await expect(repository.aggregateMonthly("organization-1", scope)).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledOnce();
  });
});
