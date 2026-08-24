import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AccountSummary,
  CategoryNode,
  LedgerSummary,
  TransactionRecord,
} from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { BookkeepingApi } from "../../../services/bookkeeping-api";
import { TransactionFormDialog } from "./transaction-form-dialog";

const ledgerA: LedgerSummary = {
  id: "ledger-a",
  name: "账本 A",
  type: "personal",
  isDefault: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const ledgerB: LedgerSummary = { ...ledgerA, id: "ledger-b", name: "账本 B", isDefault: false };
const account: AccountSummary = {
  id: "account-a",
  name: "银行卡",
  type: "bank",
  icon: null,
  color: null,
  sortOrder: 0,
  balanceMinor: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const categoryA: CategoryNode = {
  id: "category-a",
  ledgerId: ledgerA.id,
  type: "expense",
  parentId: null,
  name: "餐饮",
  icon: null,
  color: null,
  sortOrder: 0,
  children: [],
};
const categoryB: CategoryNode = {
  ...categoryA,
  id: "category-b",
  ledgerId: ledgerB.id,
  type: "income",
  name: "工资",
};
const transactionA: TransactionRecord = {
  id: "transaction-a",
  ledgerId: ledgerA.id,
  ledgerName: ledgerA.name,
  type: "expense",
  accountId: account.id,
  accountName: account.name,
  destinationAccountId: null,
  destinationAccountName: null,
  categoryId: categoryA.id,
  categoryName: categoryA.name,
  amountMinor: 1_234,
  occurredAt: "2026-08-23T16:30:00.000Z",
  payee: null,
  note: "旧交易",
  createdAt: "2026-08-23T16:31:00.000Z",
  updatedAt: "2026-08-23T16:31:00.000Z",
};
const transactionB: TransactionRecord = {
  ...transactionA,
  ledgerId: ledgerB.id,
  ledgerName: ledgerB.name,
  type: "income",
  categoryId: categoryB.id,
  categoryName: categoryB.name,
  note: "后台更新交易",
};

describe("TransactionFormDialog", () => {
  it("opens with the latest ledger and type after closed transaction props change", async () => {
    const user = userEvent.setup();
    const listCategories = vi.fn(async ({ ledgerId }: { ledgerId: string }) =>
      ledgerId === ledgerB.id ? [categoryB] : [categoryA],
    );
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const api = { listCategories } as unknown as BookkeepingApi;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TransactionFormDialog
          accounts={[account]}
          api={api}
          ledgers={[ledgerA, ledgerB]}
          organizationId="org-a"
          transaction={transactionA}
          onUpdate={onUpdate}
        />
      </QueryClientProvider>,
    );

    rerender(
      <QueryClientProvider client={queryClient}>
        <TransactionFormDialog
          accounts={[account]}
          api={api}
          ledgers={[ledgerA, ledgerB]}
          organizationId="org-a"
          transaction={transactionB}
          onUpdate={onUpdate}
        />
      </QueryClientProvider>,
    );
    expect(listCategories).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "编辑 后台更新交易" }));
    await waitFor(() => expect(listCategories).toHaveBeenCalledWith({ ledgerId: ledgerB.id }));
    expect(screen.getByRole("combobox", { name: "交易类型" })).toHaveTextContent("收入");
    await user.click(screen.getByRole("combobox", { name: "分类" }));
    await user.click(await screen.findByRole("option", { name: "工资" }));
    await user.click(screen.getByRole("button", { name: "保存交易" }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        transactionB.id,
        expect.objectContaining({
          ledgerId: ledgerB.id,
          type: "income",
          categoryId: categoryB.id,
        }),
      ),
    );
  });
});
