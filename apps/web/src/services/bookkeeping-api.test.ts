import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "./api-client";
import { createBookkeepingApi } from "./bookkeeping-api";

describe("createBookkeepingApi", () => {
  function createHarness() {
    const client = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    };

    return { api: createBookkeepingApi(client as unknown as ApiClient), client };
  }

  it("serializes transaction filters in a stable order and omits undefined values", async () => {
    const { api, client } = createHarness();

    await api.listTransactions({
      ledgerId: "ledger-1",
      type: "expense",
      from: "2026-08-01",
      to: "2026-08-31",
      page: 2,
      pageSize: 20,
    });

    expect(client.get).toHaveBeenCalledWith(
      "/transactions/list?ledgerId=ledger-1&type=expense&from=2026-08-01&to=2026-08-31&page=2&pageSize=20",
    );
  });

  it("encodes free-text transaction filters and wraps transaction actions", async () => {
    const { api, client } = createHarness();
    const input = {
      ledgerId: "ledger-1",
      type: "expense" as const,
      accountId: "account-1",
      categoryId: "category-1",
      amountMinor: 1_234,
      occurredAt: "2026-08-23T16:30:00.000Z",
      payee: "房东 / 中介",
    };

    await api.listTransactions({ keyword: "房租 / 水电" });
    await api.getTransaction("tx-1");
    await api.createTransaction(input);
    await api.updateTransaction("tx-1", input);
    await api.deleteTransaction("tx-1");

    expect(client.get).toHaveBeenNthCalledWith(
      1,
      "/transactions/list?keyword=%E6%88%BF%E7%A7%9F+%2F+%E6%B0%B4%E7%94%B5",
    );
    expect(client.get).toHaveBeenNthCalledWith(2, "/transactions/detail?id=tx-1");
    expect(client.post).toHaveBeenNthCalledWith(1, "/transactions/create", input);
    expect(client.post).toHaveBeenNthCalledWith(2, "/transactions/update", {
      id: "tx-1",
      ...input,
    });
    expect(client.post).toHaveBeenNthCalledWith(3, "/transactions/delete", { id: "tx-1" });
  });

  it("wraps ledger, account, category and monthly statistics endpoints", async () => {
    const { api, client } = createHarness();
    const account = { name: "银行卡", type: "bank" as const, initialBalanceMinor: 500 };
    const category = {
      ledgerId: "ledger-1",
      type: "expense" as const,
      name: "房租",
      parentId: null,
    };
    client.get.mockResolvedValue([]);

    await api.listLedgers();
    await api.listPersonalLedgers();
    await api.listAccounts();
    await api.createAccount(account);
    await api.updateAccount("account-1", { name: "工资卡", icon: null });
    await api.deleteAccount("account-1");
    await api.listCategories({ ledgerId: "ledger-1", type: "expense" });
    await api.createCategory(category);
    await api.updateCategory("category-1", { name: "整租", color: null });
    await api.deleteCategory("category-1");
    await api.getMonthlyStatistics({ month: "2026-08", ledgerId: "ledger-1" });

    expect(client.get).toHaveBeenNthCalledWith(1, "/ledgers/list");
    expect(client.get).toHaveBeenNthCalledWith(2, "/ledgers/list");
    expect(client.get).toHaveBeenNthCalledWith(3, "/accounts/list");
    expect(client.post).toHaveBeenNthCalledWith(1, "/accounts/create", account);
    expect(client.post).toHaveBeenNthCalledWith(2, "/accounts/update", {
      id: "account-1",
      name: "工资卡",
      icon: null,
    });
    expect(client.post).toHaveBeenNthCalledWith(3, "/accounts/delete", { id: "account-1" });
    expect(client.get).toHaveBeenNthCalledWith(
      4,
      "/categories/list?ledgerId=ledger-1&type=expense",
    );
    expect(client.post).toHaveBeenNthCalledWith(4, "/categories/create", category);
    expect(client.post).toHaveBeenNthCalledWith(5, "/categories/update", {
      id: "category-1",
      name: "整租",
      color: null,
    });
    expect(client.post).toHaveBeenNthCalledWith(6, "/categories/delete", { id: "category-1" });
    expect(client.get).toHaveBeenNthCalledWith(
      5,
      "/statistics/monthly?month=2026-08&ledgerId=ledger-1",
    );
  });

  it("excludes rental ledgers from the ordinary bookkeeping selection boundary", async () => {
    const { api, client } = createHarness();
    client.get.mockResolvedValueOnce([
      { id: "personal-1", type: "personal", isDefault: true },
      { id: "rental-1", type: "rental", isDefault: false },
    ]);

    await expect(api.listPersonalLedgers()).resolves.toEqual([
      { id: "personal-1", type: "personal", isDefault: true },
    ]);
  });
});
