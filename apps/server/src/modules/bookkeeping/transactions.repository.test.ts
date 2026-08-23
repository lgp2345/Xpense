import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { accountMovements, transactions } from "../../db/schema.js";
import {
  buildTransactionCountQuery,
  buildTransactionListQuery,
  buildTransactionMovementsQuery,
} from "./transactions.queries.js";
import { TransactionsRepository } from "./transactions.repository.js";

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

function queryResult<T>(
  rows: T[],
  terminalMethod: "where" | "orderBy" | "limit" | "offset",
): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "offset"]) {
    query[method] = vi
      .fn()
      .mockImplementation(() => (method === terminalMethod ? Promise.resolve(rows) : query));
  }
  return query;
}

const listInput = {
  ledgerId: "ledger-1",
  accountId: "account-1",
  categoryId: "category-1",
  type: "expense" as const,
  keyword: "房租",
  from: "2026-08-01",
  to: "2026-08-31",
  page: 3,
  pageSize: 25,
};

describe("transaction repository queries", () => {
  it("renders item and count queries with the same organization-scoped active filters", () => {
    const items = buildTransactionListQuery(
      new QueryBuilder() as never,
      "organization-1",
      listInput,
    ).toSQL();
    const count = buildTransactionCountQuery(
      new QueryBuilder() as never,
      "organization-1",
      listInput,
    ).toSQL();
    const itemSql = normalizeSql(items.sql);
    const countSql = normalizeSql(count.sql);

    for (const sql of [itemSql, countSql]) {
      expect(sql).toContain('"transactions"."organization_id" =');
      expect(sql).toContain('"transactions"."deleted_at" is null');
      expect(sql).toContain('"transactions"."ledger_id" =');
      expect(sql).toContain('"transactions"."category_id" =');
      expect(sql).toContain('"transactions"."type" =');
      expect(sql).toContain('"transactions"."occurred_on" >=');
      expect(sql).toContain('"transactions"."occurred_on" <=');
      expect(sql).toContain("ilike");
      expect(sql).toContain('exists (select "id" from "account_movements"');
      expect(sql).toContain('"account_movements"."account_id" =');
    }
    for (const value of [
      "organization-1",
      "ledger-1",
      "account-1",
      "category-1",
      "expense",
      "%房租%",
      "2026-08-01",
      "2026-08-31",
    ]) {
      expect(items.params).toContain(value);
      expect(count.params).toContain(value);
    }
    expect(itemSql).toContain(
      'order by "transactions"."occurred_at" desc, "transactions"."created_at" desc',
    );
    expect(itemSql).not.toContain('"categories"."deleted_at"');
    expect(itemSql).not.toContain('"ledgers"."deleted_at"');
    expect(items.params.slice(-2)).toEqual([25, 50]);
    expect(countSql).not.toContain("order by");
  });

  it("always excludes internal transaction types from the ordinary transaction API", () => {
    const query = buildTransactionCountQuery(new QueryBuilder() as never, "organization-1", {
      page: 1,
      pageSize: 20,
    }).toSQL();

    expect(normalizeSql(query.sql)).toContain('"transactions"."type" in');
    expect(query.params).toEqual(expect.arrayContaining(["income", "expense", "transfer"]));
    expect(query.params).not.toContain("excluded_inflow");
    expect(query.params).not.toContain("excluded_outflow");
  });

  it("loads all page movements and historical account names with one organization-scoped query", () => {
    const query = buildTransactionMovementsQuery(new QueryBuilder() as never, "organization-1", [
      "transaction-1",
      "transaction-2",
    ]).toSQL();
    const sql = normalizeSql(query.sql);

    expect(sql).toContain('from "account_movements" inner join "accounts"');
    expect(sql).toContain('"account_movements"."organization_id" =');
    expect(sql).toContain('"account_movements"."transaction_id" in');
    expect(sql).toContain('"accounts"."organization_id" =');
    expect(sql).not.toContain('"accounts"."deleted_at" is null');
    expect(query.params).toEqual(
      expect.arrayContaining(["organization-1", "transaction-1", "transaction-2"]),
    );
  });
});

describe("TransactionsRepository", () => {
  it("reads organization settings and locks the active transaction through the supplied executor", async () => {
    const organizationLimit = vi
      .fn()
      .mockResolvedValue([{ baseCurrency: "CNY", timezone: "Asia/Shanghai" }]);
    const organizationWhere = vi.fn().mockReturnValue({ limit: organizationLimit });
    const organizationFrom = vi.fn().mockReturnValue({ where: organizationWhere });
    const transactionLimit = vi.fn().mockResolvedValue([{ id: "transaction-1", type: "expense" }]);
    const forUpdate = vi.fn().mockReturnValue({ limit: transactionLimit });
    const transactionWhere = vi.fn().mockReturnValue({ for: forUpdate });
    const transactionFrom = vi.fn().mockReturnValue({ where: transactionWhere });
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: organizationFrom })
      .mockReturnValueOnce({ from: transactionFrom });
    const repository = new TransactionsRepository({ select: vi.fn() } as never);
    const executor = { select } as never;

    await expect(
      repository.findLockedOrganizationContext("organization-1", executor),
    ).resolves.toEqual({ baseCurrency: "CNY", timezone: "Asia/Shanghai" });
    await expect(
      repository.findActiveOwnedForUpdate("organization-1", "transaction-1", executor),
    ).resolves.toEqual({ id: "transaction-1", type: "expense" });

    expect(forUpdate).toHaveBeenCalledWith("update");
    const condition = transactionWhere.mock.calls[0]?.[0];
    for (const reference of [
      transactions.organizationId,
      "organization-1",
      transactions.id,
      "transaction-1",
      transactions.deletedAt,
      transactions.type,
      "income",
      "expense",
      "transfer",
    ]) {
      expect(containsReference(condition, reference)).toBe(true);
    }
  });

  it("runs one item, one count and one batch movement query and maps source/destination", async () => {
    const occurredAt = new Date("2026-08-23T12:00:00.000Z");
    const createdAt = new Date("2026-08-23T12:01:00.000Z");
    const updatedAt = new Date("2026-08-23T12:02:00.000Z");
    const headers = [
      {
        id: "transaction-1",
        ledgerId: "ledger-1",
        ledgerName: "个人账本",
        type: "transfer" as const,
        categoryId: null,
        categoryName: null,
        amountMinor: 10_000,
        occurredAt,
        payee: null,
        note: "转存",
        createdAt,
        updatedAt,
      },
    ];
    const movements = [
      {
        transactionId: "transaction-1",
        accountId: "bank",
        accountName: "银行卡",
        amountMinor: -10_000,
      },
      {
        transactionId: "transaction-1",
        accountId: "wallet",
        accountName: "钱包",
        amountMinor: 10_000,
      },
    ];
    const queries = [
      queryResult(headers, "offset"),
      queryResult([{ total: 1 }], "where"),
      queryResult(movements, "orderBy"),
    ];
    const select = vi.fn().mockImplementation(() => queries.shift());
    const repository = new TransactionsRepository({ select } as never);

    await expect(repository.list("organization-1", { page: 1, pageSize: 20 })).resolves.toEqual({
      items: [
        {
          id: "transaction-1",
          ledgerId: "ledger-1",
          ledgerName: "个人账本",
          type: "transfer",
          accountId: "bank",
          accountName: "银行卡",
          destinationAccountId: "wallet",
          destinationAccountName: "钱包",
          categoryId: null,
          categoryName: null,
          amountMinor: 10_000,
          occurredAt: occurredAt.toISOString(),
          payee: null,
          note: "转存",
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(select).toHaveBeenCalledTimes(3);
  });

  it("returns a detail using historical soft-deleted account and category names", async () => {
    const header = {
      id: "transaction-1",
      ledgerId: "ledger-1",
      ledgerName: "历史账本",
      type: "expense" as const,
      categoryId: "category-1",
      categoryName: "旧分类",
      amountMinor: 1200,
      occurredAt: new Date("2026-08-23T12:00:00.000Z"),
      payee: "商户",
      note: null,
      createdAt: new Date("2026-08-23T12:01:00.000Z"),
      updatedAt: new Date("2026-08-23T12:02:00.000Z"),
    };
    const movements = [
      {
        transactionId: "transaction-1",
        accountId: "account-1",
        accountName: "已删除账户",
        amountMinor: -1200,
      },
    ];
    const select = vi
      .fn()
      .mockReturnValueOnce(queryResult([header], "limit"))
      .mockReturnValueOnce(queryResult(movements, "orderBy"));
    const repository = new TransactionsRepository({ select } as never);

    await expect(repository.findDetail("organization-1", "transaction-1")).resolves.toEqual(
      expect.objectContaining({
        id: "transaction-1",
        accountName: "已删除账户",
        categoryName: "旧分类",
      }),
    );
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("creates a header and every movement through the supplied executor", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "transaction-1" }]);
    const transactionValues = vi.fn().mockReturnValue({ returning });
    const movementValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi
      .fn()
      .mockImplementation((table) =>
        table === transactions ? { values: transactionValues } : { values: movementValues },
      );
    const repository = new TransactionsRepository({} as never);
    const occurredAt = new Date("2026-08-23T12:00:00.000Z");

    await expect(
      repository.create(
        {
          organizationId: "organization-1",
          ledgerId: "ledger-1",
          type: "expense",
          categoryId: "category-1",
          amountMinor: 1200,
          occurredAt,
          occurredOn: "2026-08-23",
          payee: null,
          note: null,
          actorUserId: "user-1",
        },
        [{ accountId: "account-1", amountMinor: -1200 }],
        { insert } as never,
      ),
    ).resolves.toBe("transaction-1");
    expect(transactionValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        amountMinor: 1200,
        createdByUserId: "user-1",
        updatedByUserId: "user-1",
      }),
    );
    expect(movementValues).toHaveBeenCalledWith([
      expect.objectContaining({
        transactionId: "transaction-1",
        accountId: "account-1",
        amountMinor: -1200,
      }),
    ]);
  });

  it("updates the header then deletes and recreates only that transaction's movements", async () => {
    const headerWhere = vi.fn().mockResolvedValue(undefined);
    const headerSet = vi.fn().mockReturnValue({ where: headerWhere });
    const update = vi.fn().mockReturnValue({ set: headerSet });
    const movementWhere = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockReturnValue({ where: movementWhere });
    const movementValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values: movementValues });
    const repository = new TransactionsRepository({} as never);

    await repository.update(
      {
        id: "transaction-1",
        organizationId: "organization-1",
        ledgerId: "ledger-1",
        type: "income",
        categoryId: "category-1",
        amountMinor: 500,
        occurredAt: new Date("2026-08-23T12:00:00.000Z"),
        occurredOn: "2026-08-23",
        payee: null,
        note: null,
        actorUserId: "user-1",
      },
      [{ accountId: "account-1", amountMinor: 500 }],
      { update, delete: remove, insert } as never,
    );

    expect(update).toHaveBeenCalledWith(transactions);
    expect(remove).toHaveBeenCalledWith(accountMovements);
    expect(insert).toHaveBeenCalledWith(accountMovements);
    expect(movementValues).toHaveBeenCalledWith([
      expect.objectContaining({ transactionId: "transaction-1", amountMinor: 500 }),
    ]);
    const headerCondition = headerWhere.mock.calls[0]?.[0];
    for (const reference of [
      transactions.organizationId,
      "organization-1",
      transactions.id,
      "transaction-1",
      transactions.deletedAt,
    ]) {
      expect(containsReference(headerCondition, reference)).toBe(true);
    }
    const movementCondition = movementWhere.mock.calls[0]?.[0];
    for (const reference of [
      accountMovements.organizationId,
      "organization-1",
      accountMovements.transactionId,
      "transaction-1",
    ]) {
      expect(containsReference(movementCondition, reference)).toBe(true);
    }
  });

  it("soft deletes only the active header and leaves movement rows untouched", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const remove = vi.fn();
    const repository = new TransactionsRepository({} as never);

    await repository.softDelete(
      {
        id: "transaction-1",
        organizationId: "organization-1",
        deletedByUserId: "user-1",
      },
      { update, delete: remove } as never,
    );

    expect(update).toHaveBeenCalledWith(transactions);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        deletedByUserId: "user-1",
        updatedAt: expect.any(Date),
      }),
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
