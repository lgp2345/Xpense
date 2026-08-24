import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { BookkeepingApi } from "./bookkeeping-api";
import {
  bookkeepingKeys,
  bookkeepingQueryOptions,
  invalidateAccountMutation,
  invalidateCategoryMutation,
  invalidateTransactionMutation,
} from "./bookkeeping-query";

/** 创建覆盖全部记账方法且允许定制查询行为的测试 API。 */
function createApi(overrides: Partial<BookkeepingApi> = {}): BookkeepingApi {
  return {
    listLedgers: vi.fn().mockResolvedValue([]),
    listAccounts: vi.fn().mockResolvedValue([]),
    listCategories: vi.fn().mockResolvedValue([]),
    listTransactions: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    getTransaction: vi.fn(),
    getMonthlyStatistics: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    ...overrides,
  } as BookkeepingApi;
}

describe("bookkeeping query cache", () => {
  it("deduplicates equal normalized transaction reads and isolates every key by organization", async () => {
    const api = createApi();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = bookkeepingQueryOptions.transactions(api, "org-a", {
      keyword: " rent ",
      page: 1,
      pageSize: 20,
    });
    const equal = bookkeepingQueryOptions.transactions(api, "org-a", {
      pageSize: 20,
      page: 1,
      keyword: "rent",
    });
    const otherOrganization = bookkeepingQueryOptions.transactions(api, "org-b", {
      keyword: "rent",
      page: 1,
      pageSize: 20,
    });

    await Promise.all([client.fetchQuery(first), client.fetchQuery(equal)]);

    expect(api.listTransactions).toHaveBeenCalledOnce();
    expect(api.listTransactions).toHaveBeenCalledWith({
      keyword: "rent",
      page: 1,
      pageSize: 20,
    });
    expect(first.queryKey).toEqual(equal.queryKey);
    expect(otherOrganization.queryKey).not.toEqual(first.queryKey);
    expect(first.queryKey.slice(0, 2)).toEqual(["bookkeeping", "org-a"]);
    expect(bookkeepingKeys.accounts("org-b").slice(0, 2)).toEqual(["bookkeeping", "org-b"]);
    expect(bookkeepingKeys.categories("org-b", { ledgerId: "ledger-1" }).slice(0, 2)).toEqual([
      "bookkeeping",
      "org-b",
    ]);
    expect(bookkeepingKeys.monthly("org-b", { month: "2026-08" }).slice(0, 2)).toEqual([
      "bookkeeping",
      "org-b",
    ]);
  });

  it("invalidates only the business prefixes affected by each successful mutation", async () => {
    const client = new QueryClient();
    const organizationId = "org-a";
    const keys = {
      accounts: bookkeepingKeys.accounts(organizationId),
      categories: bookkeepingKeys.categories(organizationId, { ledgerId: "ledger-1" }),
      ledgers: bookkeepingKeys.ledgers(organizationId),
      monthly: bookkeepingKeys.monthly(organizationId, { month: "2026-08" }),
      transactions: bookkeepingKeys.transactions(organizationId, { page: 1, pageSize: 20 }),
    };
    for (const key of Object.values(keys)) client.setQueryData(key, []);

    await invalidateTransactionMutation(client, organizationId);
    expect(client.getQueryState(keys.transactions)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.accounts)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.monthly)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.categories)?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys.ledgers)?.isInvalidated).toBe(false);

    client.getQueryCache().clear();
    for (const key of Object.values(keys)) client.setQueryData(key, []);
    await invalidateCategoryMutation(client, organizationId);
    expect(client.getQueryState(keys.categories)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.transactions)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.monthly)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.accounts)?.isInvalidated).toBe(false);

    client.getQueryCache().clear();
    for (const key of Object.values(keys)) client.setQueryData(key, []);
    await invalidateAccountMutation(client, organizationId);
    expect(client.getQueryState(keys.accounts)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.transactions)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.monthly)?.isInvalidated).toBe(false);
  });
});
