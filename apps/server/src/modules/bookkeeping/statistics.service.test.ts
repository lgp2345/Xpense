import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { StatisticsService } from "./statistics.service.js";

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "organization-1",
  isSuperAdmin: false,
  permissions: [],
};

const ledgerId = "123e4567-e89b-12d3-a456-426614174000";

type FixtureTransaction = {
  organizationId: string;
  ledgerId: string;
  type: "income" | "expense" | "transfer" | "excluded_inflow" | "excluded_outflow";
  categoryId: string | null;
  categoryName: string | null;
  amountMinor: number;
  occurredOn: string;
  deleted: boolean;
};

const fixture: FixtureTransaction[] = [
  {
    organizationId: "organization-1",
    ledgerId,
    type: "income",
    categoryId: "income-1",
    categoryName: "工资",
    amountMinor: 500_000,
    occurredOn: "2026-08-05",
    deleted: false,
  },
  {
    organizationId: "organization-1",
    ledgerId,
    type: "expense",
    categoryId: "expense-1",
    categoryName: "已删除的居住分类",
    amountMinor: 100_000,
    occurredOn: "2026-08-06",
    deleted: false,
  },
  {
    organizationId: "organization-1",
    ledgerId,
    type: "expense",
    categoryId: "expense-2",
    categoryName: "餐饮",
    amountMinor: 20_000,
    occurredOn: "2026-08-07",
    deleted: false,
  },
  {
    organizationId: "organization-1",
    ledgerId,
    type: "transfer",
    categoryId: null,
    categoryName: null,
    amountMinor: 300_000,
    occurredOn: "2026-08-08",
    deleted: false,
  },
  {
    organizationId: "organization-1",
    ledgerId,
    type: "excluded_inflow",
    categoryId: null,
    categoryName: null,
    amountMinor: 10_000,
    occurredOn: "2026-08-01",
    deleted: false,
  },
  {
    organizationId: "organization-1",
    ledgerId,
    type: "expense",
    categoryId: "expense-2",
    categoryName: "餐饮",
    amountMinor: 90_000,
    occurredOn: "2026-08-09",
    deleted: true,
  },
  {
    organizationId: "organization-1",
    ledgerId,
    type: "expense",
    categoryId: "expense-2",
    categoryName: "餐饮",
    amountMinor: 80_000,
    occurredOn: "2026-07-31",
    deleted: false,
  },
  {
    organizationId: "organization-1",
    ledgerId: "223e4567-e89b-12d3-a456-426614174000",
    type: "expense",
    categoryId: "expense-3",
    categoryName: "其他账本",
    amountMinor: 70_000,
    occurredOn: "2026-08-10",
    deleted: false,
  },
  {
    organizationId: "organization-2",
    ledgerId,
    type: "income",
    categoryId: "income-1",
    categoryName: "工资",
    amountMinor: 600_000,
    occurredOn: "2026-08-11",
    deleted: false,
  },
];

function aggregateFixture(
  organizationId: string,
  scope: { firstDay: string; lastDay: string; ledgerId?: string },
) {
  const rows = fixture.filter(
    (row) =>
      row.organizationId === organizationId &&
      !row.deleted &&
      (row.type === "income" || row.type === "expense") &&
      row.occurredOn >= scope.firstDay &&
      row.occurredOn <= scope.lastDay &&
      (!scope.ledgerId || row.ledgerId === scope.ledgerId),
  );
  const grouped = Map.groupBy(rows, (row) => `${row.type}:${row.categoryId ?? "uncategorized"}`);

  return [...grouped.values()].map((categoryRows) => {
    const first = categoryRows[0];
    if (!first) throw new Error("Fixture group must not be empty");

    return {
      type: first.type as "income" | "expense",
      categoryId: first.categoryId ?? "uncategorized",
      categoryName: first.categoryName ?? "未分类",
      amountMinor: String(categoryRows.reduce((sum, row) => sum + row.amountMinor, 0)),
    };
  });
}

describe("StatisticsService", () => {
  function createHarness() {
    const repository = {
      findOrganizationCurrency: vi.fn().mockResolvedValue({ baseCurrency: "CNY" }),
      findActiveOwnedLedger: vi.fn().mockResolvedValue({ id: ledgerId }),
      aggregateMonthly: vi.fn().mockImplementation(aggregateFixture),
    };
    return {
      repository,
      service: new StatisticsService(repository as never),
    };
  }

  it("aggregates only active income and expense in the requested organization, month, and ledger", async () => {
    const { repository, service } = createHarness();

    await expect(service.monthly(authContext, { month: "2026-08", ledgerId })).resolves.toEqual({
      currency: "CNY",
      incomeMinor: 500_000,
      expenseMinor: 120_000,
      netMinor: 380_000,
      expenseCategories: [
        {
          categoryId: "expense-1",
          categoryName: "已删除的居住分类",
          amountMinor: 100_000,
          percentage: 83.33,
        },
        {
          categoryId: "expense-2",
          categoryName: "餐饮",
          amountMinor: 20_000,
          percentage: 16.67,
        },
      ],
    });
    expect(repository.aggregateMonthly).toHaveBeenCalledWith("organization-1", {
      firstDay: "2026-08-01",
      lastDay: "2026-08-31",
      ledgerId,
    });
  });

  it("aggregates every ledger when ledgerId is omitted", async () => {
    const { repository, service } = createHarness();

    await expect(service.monthly(authContext, { month: "2026-08" })).resolves.toMatchObject({
      incomeMinor: 500_000,
      expenseMinor: 190_000,
      netMinor: 310_000,
    });
    expect(repository.findActiveOwnedLedger).not.toHaveBeenCalled();
  });

  it("returns not found without aggregation for a missing organization or inactive owned ledger", async () => {
    const { repository, service } = createHarness();
    repository.findOrganizationCurrency.mockResolvedValueOnce(null);

    await expect(service.monthly(authContext, { month: "2026-08" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.aggregateMonthly).not.toHaveBeenCalled();

    repository.findOrganizationCurrency.mockResolvedValueOnce({ baseCurrency: "CNY" });
    repository.findActiveOwnedLedger.mockResolvedValueOnce(null);
    await expect(
      service.monthly(authContext, { month: "2026-08", ledgerId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.aggregateMonthly).not.toHaveBeenCalled();
  });

  it("returns zero-safe percentages and a stable uncategorized bucket", async () => {
    const { repository, service } = createHarness();
    repository.aggregateMonthly.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        type: "expense",
        categoryId: "uncategorized",
        categoryName: "未分类",
        amountMinor: "1",
      },
      {
        type: "expense",
        categoryId: "expense-1",
        categoryName: "餐饮",
        amountMinor: "2",
      },
    ]);

    await expect(service.monthly(authContext, { month: "2026-08" })).resolves.toEqual({
      currency: "CNY",
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
      expenseCategories: [],
    });
    await expect(service.monthly(authContext, { month: "2026-08" })).resolves.toMatchObject({
      expenseCategories: [
        expect.objectContaining({ categoryId: "expense-1", percentage: 66.67 }),
        expect.objectContaining({ categoryId: "uncategorized", percentage: 33.33 }),
      ],
    });
  });

  it.each([
    "9007199254740992",
    "1.5",
    "not-a-number",
    1,
  ])("rejects unsafe aggregate value %s instead of returning a rounded amount", async (incomeMinor) => {
    const { repository, service } = createHarness();
    repository.aggregateMonthly.mockResolvedValue([
      {
        type: "income",
        categoryId: "income-1",
        categoryName: "工资",
        amountMinor: incomeMinor,
      },
    ]);

    await expect(service.monthly(authContext, { month: "2026-08" })).rejects.toThrow(
      "Invalid monthly aggregate amount",
    );
  });

  it("merges duplicate expense category rows and rejects cumulative overflow before Number conversion", async () => {
    const { repository, service } = createHarness();
    repository.aggregateMonthly
      .mockResolvedValueOnce([
        {
          type: "expense",
          categoryId: "expense-1",
          categoryName: "餐饮",
          amountMinor: 1n,
        },
        {
          type: "expense",
          categoryId: "expense-1",
          categoryName: "餐饮",
          amountMinor: "2",
        },
      ])
      .mockResolvedValueOnce([
        {
          type: "income",
          categoryId: "income-1",
          categoryName: "工资",
          amountMinor: String(Number.MAX_SAFE_INTEGER),
        },
        {
          type: "income",
          categoryId: "income-2",
          categoryName: "奖金",
          amountMinor: "1",
        },
      ]);

    await expect(service.monthly(authContext, { month: "2026-08" })).resolves.toMatchObject({
      expenseMinor: 3,
      expenseCategories: [
        {
          categoryId: "expense-1",
          categoryName: "餐饮",
          amountMinor: 3,
          percentage: 100,
        },
      ],
    });
    await expect(service.monthly(authContext, { month: "2026-08" })).rejects.toThrow(
      "Invalid monthly aggregate amount",
    );
  });
});
