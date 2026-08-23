import { describe, expect, it } from "vitest";

import {
  type AccountSummary,
  accountTypes,
  type CategoryNode,
  categoryTypes,
  type LedgerSummary,
  ledgerTypes,
  type MonthlyStatistics,
  type TransactionPage,
  type TransactionRecord,
  transactionTypes,
  type UpsertTransactionRequest,
} from "./bookkeeping.js";

const ledgerContract = {
  id: "ledger-1",
  name: "个人账本",
  type: "personal",
  isDefault: true,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
} satisfies LedgerSummary;

const accountContract = {
  id: "account-1",
  name: "现金",
  type: "cash",
  icon: null,
  color: null,
  sortOrder: 0,
  balanceMinor: 0,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
} satisfies AccountSummary;

const categoryContract = {
  id: "category-1",
  ledgerId: "ledger-1",
  type: "expense",
  parentId: null,
  name: "餐饮",
  icon: null,
  color: null,
  sortOrder: 0,
  children: [],
} satisfies CategoryNode;

const transactionContract = {
  id: "transaction-1",
  ledgerId: "ledger-1",
  ledgerName: "个人账本",
  type: "expense",
  accountId: "account-1",
  accountName: "现金",
  destinationAccountId: null,
  destinationAccountName: null,
  categoryId: "category-1",
  categoryName: "餐饮",
  amountMinor: 2_500,
  occurredAt: "2026-08-23T00:00:00.000Z",
  payee: "午餐",
  note: "工作日",
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
} satisfies TransactionRecord;

const transactionPageContract = {
  items: [transactionContract],
  total: 1,
  page: 1,
  pageSize: 20,
} satisfies TransactionPage;

const monthlyStatisticsContract = {
  currency: "CNY",
  incomeMinor: 5_000,
  expenseMinor: 2_500,
  netMinor: 2_500,
  expenseCategories: [
    {
      categoryId: "category-1",
      categoryName: "餐饮",
      amountMinor: 2_500,
      percentage: 100,
    },
  ],
} satisfies MonthlyStatistics;

const upsertTransactionRequestContract = {
  ledgerId: "ledger-1",
  type: "expense",
  accountId: "account-1",
  categoryId: "category-1",
  amountMinor: 2_500,
  occurredAt: "2026-08-23T00:00:00.000Z",
  payee: "午餐",
  note: "工作日",
} satisfies UpsertTransactionRequest;

describe("bookkeeping contracts", () => {
  it("keeps public enums stable", () => {
    expect(ledgerTypes).toEqual(["personal", "rental"]);
    expect(accountTypes).toEqual(["cash", "bank", "e_wallet", "credit_card", "other"]);
    expect(categoryTypes).toEqual(["income", "expense"]);
    expect(transactionTypes).toEqual(["income", "expense", "transfer"]);
  });

  it("expresses API data with string identifiers, ISO dates, and minor-unit amounts", () => {
    expect(ledgerContract.id).toBe("ledger-1");
    expect(accountContract.balanceMinor).toBe(0);
    expect(categoryContract.ledgerId).toBe("ledger-1");
    expect(transactionPageContract.items).toEqual([transactionContract]);
    expect(monthlyStatisticsContract.netMinor).toBe(2_500);
    expect(monthlyStatisticsContract.expenseCategories[0]?.amountMinor).toBe(2_500);
    expect(upsertTransactionRequestContract.occurredAt).toBe("2026-08-23T00:00:00.000Z");
  });
});
