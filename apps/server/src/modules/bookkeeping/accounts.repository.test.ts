import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { accountMovements, accounts, transactions } from "../../db/schema.js";
import {
  buildActiveAccountSummaryQuery,
  buildActiveAccountsForUpdateQuery,
  buildActiveAccountsQuery,
} from "./accounts.queries.js";
import { AccountsRepository } from "./accounts.repository.js";

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

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function flattenSqlStructure(value: string): string {
  return normalizeSql(value.replace(/[()]/g, " "));
}

function expectActiveBalanceQuery(
  query: { sql: string; params: unknown[] },
  expectedWhere: string,
  expectedParams: unknown[],
): void {
  const statement = normalizeSql(query.sql);
  const structure = flattenSqlStructure(query.sql);

  expect(statement).toContain(
    'coalesce(sum("account_movements"."amount_minor") filter (where "transactions"."deleted_at" is null), 0)',
  );
  expect(structure).toContain(
    'left join "account_movements" on "account_movements"."organization_id" = $1 and "account_movements"."account_id" = "accounts"."id"',
  );
  expect(structure).toContain(
    'left join "transactions" on "transactions"."organization_id" = $2 and "transactions"."id" = "account_movements"."transaction_id"',
  );
  expect(structure).toContain(expectedWhere);
  expect(statement).toContain(
    'group by "accounts"."id", "accounts"."name", "accounts"."type", "accounts"."icon", "accounts"."color", "accounts"."sort_order", "accounts"."created_at", "accounts"."updated_at"',
  );
  expect(statement.match(/left join "account_movements"/g)).toHaveLength(1);
  expect(statement.match(/left join "transactions"/g)).toHaveLength(1);
  expect(statement).not.toContain("cross join");
  expect(query.params).toEqual(expectedParams);
}

describe("AccountsRepository", () => {
  it("renders one stable active-account row-lock query for deduplicated IDs", () => {
    const query = buildActiveAccountsForUpdateQuery(new QueryBuilder() as never, "organization-1", [
      "account-b",
      "account-a",
      "account-b",
    ]).toSQL();
    const sql = normalizeSql(query.sql);
    const structure = flattenSqlStructure(query.sql);

    expect(structure).toContain(
      'where "accounts"."organization_id" = $1 and "accounts"."id" in $2, $3 and "accounts"."deleted_at" is null',
    );
    expect(sql).toContain('order by "accounts"."id" asc');
    expect(sql).toContain("for update");
    expect(query.params).toEqual(["organization-1", "account-a", "account-b"]);
  });

  it("locks all requested active accounts through only the supplied transaction executor", async () => {
    const rows = [
      { id: "account-a", organizationId: "organization-1" },
      { id: "account-b", organizationId: "organization-1" },
    ];
    const forUpdate = vi.fn().mockResolvedValue(rows);
    const orderBy = vi.fn().mockReturnValue({ for: forUpdate });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const executorSelect = vi.fn().mockReturnValue({ from });
    const dbSelect = vi.fn();
    const repository = new AccountsRepository({ select: dbSelect } as never);

    await expect(
      repository.findActiveOwnedAccountsForUpdate(
        "organization-1",
        ["account-b", "account-a", "account-b"],
        { select: executorSelect } as never,
      ),
    ).resolves.toEqual(rows);

    expect(executorSelect).toHaveBeenCalledOnce();
    expect(dbSelect).not.toHaveBeenCalled();
    expect(forUpdate).toHaveBeenCalledWith("update");
  });

  it("renders the exact active-balance SQL contract for account lists", () => {
    const query = buildActiveAccountsQuery(new QueryBuilder() as never, "organization-1").toSQL();

    expectActiveBalanceQuery(
      query,
      'where "accounts"."organization_id" = $3 and "accounts"."deleted_at" is null',
      ["organization-1", "organization-1", "organization-1"],
    );
  });

  it("renders the exact active-balance SQL contract for one account summary", () => {
    const query = buildActiveAccountSummaryQuery(
      new QueryBuilder() as never,
      "organization-1",
      "account-1",
    ).toSQL();

    expectActiveBalanceQuery(
      query,
      'where "accounts"."organization_id" = $3 and "accounts"."id" = $4 and "accounts"."deleted_at" is null',
      ["organization-1", "organization-1", "organization-1", "account-1", 1],
    );
    expect(normalizeSql(query.sql)).toContain("limit $5");
    expect(query.params).toEqual([
      "organization-1",
      "organization-1",
      "organization-1",
      "account-1",
      1,
    ]);
  });

  it("lists only active organization accounts and derives balance from active transactions", async () => {
    const rows = [{ id: "account-1", balanceMinor: 100 }];
    const query = {} as Record<string, ReturnType<typeof vi.fn>>;
    query.from = vi.fn().mockReturnValue(query);
    query.leftJoin = vi.fn().mockReturnValue(query);
    query.where = vi.fn().mockReturnValue(query);
    query.groupBy = vi.fn().mockReturnValue(query);
    query.orderBy = vi.fn().mockResolvedValue(rows);
    const select = vi.fn().mockReturnValue(query);
    const repository = new AccountsRepository({ select } as never);

    await expect(repository.listActive("organization-1")).resolves.toEqual(rows);

    expect(query.from).toHaveBeenCalledWith(accounts);
    expect(query.leftJoin.mock.calls[0]?.[0]).toBe(accountMovements);
    expect(query.leftJoin.mock.calls[1]?.[0]).toBe(transactions);
    const fields = select.mock.calls[0]?.[0];
    expect(containsReference(fields.balanceMinor, accountMovements.amountMinor)).toBe(true);
    expect(containsReference(fields.balanceMinor, transactions.deletedAt)).toBe(true);
    const condition = query.where.mock.calls[0]?.[0];
    expect(containsReference(condition, accounts.organizationId)).toBe(true);
    expect(containsReference(condition, "organization-1")).toBe(true);
    expect(containsReference(condition, accounts.deletedAt)).toBe(true);
  });

  it("finds an active owned account with the supplied transaction executor", async () => {
    const account = { id: "account-1", organizationId: "organization-1" };
    const limit = vi.fn().mockResolvedValue([account]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const executorSelect = vi.fn().mockReturnValue({ from });
    const dbSelect = vi.fn();
    const repository = new AccountsRepository({ select: dbSelect } as never);

    await expect(
      repository.findActiveOwnedAccount("organization-1", "account-1", {
        select: executorSelect,
      } as never),
    ).resolves.toEqual(account);

    expect(executorSelect).toHaveBeenCalledOnce();
    expect(dbSelect).not.toHaveBeenCalled();
    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, accounts.organizationId)).toBe(true);
    expect(containsReference(condition, "organization-1")).toBe(true);
    expect(containsReference(condition, accounts.id)).toBe(true);
    expect(containsReference(condition, "account-1")).toBe(true);
    expect(containsReference(condition, accounts.deletedAt)).toBe(true);
  });

  it("uses the supplied executor for one active account summary", async () => {
    const account = { id: "account-1", balanceMinor: 100 };
    const limit = vi.fn().mockResolvedValue([account]);
    const groupBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ groupBy });
    const secondLeftJoin = vi.fn().mockReturnValue({ where });
    const firstLeftJoin = vi.fn().mockReturnValue({ leftJoin: secondLeftJoin });
    const from = vi.fn().mockReturnValue({ leftJoin: firstLeftJoin });
    const executorSelect = vi.fn().mockReturnValue({ from });
    const dbSelect = vi.fn();
    const repository = new AccountsRepository({ select: dbSelect } as never);

    await expect(
      repository.findActiveSummary("organization-1", "account-1", {
        select: executorSelect,
      } as never),
    ).resolves.toEqual(account);

    expect(executorSelect).toHaveBeenCalledOnce();
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("soft deletes only an active account in the supplied organization", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const repository = new AccountsRepository({} as never);

    await repository.softDelete(
      {
        organizationId: "organization-1",
        id: "account-1",
        deletedByUserId: "user-1",
      },
      { update } as never,
    );

    expect(update).toHaveBeenCalledWith(accounts);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        deletedByUserId: "user-1",
        updatedAt: expect.any(Date),
      }),
    );
    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, accounts.organizationId)).toBe(true);
    expect(containsReference(condition, "organization-1")).toBe(true);
    expect(containsReference(condition, accounts.id)).toBe(true);
    expect(containsReference(condition, "account-1")).toBe(true);
    expect(containsReference(condition, accounts.deletedAt)).toBe(true);
  });

  it("writes the opening transaction and signed movement through one executor", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "transaction-1" }]);
    const transactionValues = vi.fn().mockReturnValue({ returning });
    const movementValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockImplementation((table) => {
      return table === transactions ? { values: transactionValues } : { values: movementValues };
    });
    const repository = new AccountsRepository({} as never);
    const occurredAt = new Date("2026-08-23T01:02:03.000Z");

    await expect(
      repository.writeOpeningBalance(
        {
          organizationId: "organization-1",
          ledgerId: "ledger-1",
          accountId: "account-1",
          actorUserId: "user-1",
          type: "excluded_outflow",
          amountMinor: 500,
          movementAmountMinor: -500,
          occurredAt,
          occurredOn: "2026-08-23",
        },
        { insert } as never,
      ),
    ).resolves.toBe("transaction-1");

    expect(insert).toHaveBeenNthCalledWith(1, transactions);
    expect(transactionValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        type: "excluded_outflow",
        amountMinor: 500,
        createdByUserId: "user-1",
        updatedByUserId: "user-1",
      }),
    );
    expect(insert).toHaveBeenNthCalledWith(2, accountMovements);
    expect(movementValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        transactionId: "transaction-1",
        accountId: "account-1",
        amountMinor: -500,
      }),
    );
  });
});
