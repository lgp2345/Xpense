import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AccountSummary,
  CategoryNode,
  LedgerSummary,
  PermissionKey,
  TransactionPage,
  TransactionRecord,
} from "@xpense/shared";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { BookkeepingApi, ListTransactionsQuery } from "../../../services/bookkeeping-api";
import { bookkeepingKeys } from "../../../services/bookkeeping-query";
import { formatTransactionDate } from "./transaction-columns";
import { TransactionsPage } from "./transactions-page";

const ledger: LedgerSummary = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "个人账本",
  type: "personal",
  isDefault: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const familyLedger: LedgerSummary = {
  ...ledger,
  id: "723e4567-e89b-42d3-a456-426614174000",
  name: "家庭账本",
  isDefault: false,
};
const account: AccountSummary = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  name: "工资卡",
  type: "bank",
  icon: null,
  color: null,
  sortOrder: 0,
  balanceMinor: 10_000,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const destinationAccount: AccountSummary = {
  ...account,
  id: "323e4567-e89b-42d3-a456-426614174000",
  name: "现金",
  type: "cash",
};
const expenseCategory: CategoryNode = {
  id: "423e4567-e89b-42d3-a456-426614174000",
  ledgerId: ledger.id,
  type: "expense",
  parentId: null,
  name: "餐饮",
  icon: null,
  color: null,
  sortOrder: 0,
  children: [],
};
const incomeCategory: CategoryNode = {
  ...expenseCategory,
  id: "523e4567-e89b-42d3-a456-426614174000",
  type: "income",
  name: "工资",
};
const familyExpenseCategory: CategoryNode = {
  ...expenseCategory,
  id: "823e4567-e89b-42d3-a456-426614174000",
  ledgerId: familyLedger.id,
  name: "房租",
};
const transaction: TransactionRecord = {
  id: "623e4567-e89b-42d3-a456-426614174000",
  ledgerId: ledger.id,
  ledgerName: ledger.name,
  type: "expense",
  accountId: account.id,
  accountName: account.name,
  destinationAccountId: null,
  destinationAccountName: null,
  categoryId: expenseCategory.id,
  categoryName: expenseCategory.name,
  amountMinor: 1_234,
  occurredAt: "2026-08-23T16:30:00.000Z",
  payee: "面馆",
  note: "午餐",
  createdAt: "2026-08-23T16:31:00.000Z",
  updatedAt: "2026-08-23T16:31:00.000Z",
};
const familyTransaction: TransactionRecord = {
  ...transaction,
  id: "923e4567-e89b-42d3-a456-426614174000",
  ledgerId: familyLedger.id,
  ledgerName: familyLedger.name,
  categoryId: familyExpenseCategory.id,
  categoryName: familyExpenseCategory.name,
  note: "家庭房租",
};

/** 创建与输入交易行一致的服务端分页响应。 */
function page(items: TransactionRecord[] = [transaction]): TransactionPage {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

/** 创建覆盖交易依赖并允许定制单个边界的测试 API。 */
function createApi(overrides: Partial<BookkeepingApi> = {}): BookkeepingApi {
  return {
    listLedgers: vi.fn().mockResolvedValue([ledger]),
    listAccounts: vi.fn().mockResolvedValue([account, destinationAccount]),
    listCategories: vi.fn().mockResolvedValue([expenseCategory, incomeCategory]),
    listTransactions: vi.fn().mockResolvedValue(page()),
    getTransaction: vi.fn().mockResolvedValue(transaction),
    createTransaction: vi.fn().mockResolvedValue(transaction),
    updateTransaction: vi.fn().mockResolvedValue(transaction),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    getMonthlyStatistics: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    ...overrides,
  } as BookkeepingApi;
}

/** 创建可由测试精确控制完成或失败顺序的 Promise。 */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

type HarnessProps = {
  api: BookkeepingApi;
  permissions?: readonly PermissionKey[];
  initialSearch?: ListTransactionsQuery;
  onSearchChange?: (search: ListTransactionsQuery) => void;
};

/** 用独立缓存和受控 URL search 渲染交易页。 */
function renderPage({
  api,
  permissions = ["transactions:read"],
  initialSearch = {},
  onSearchChange,
}: HarnessProps) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  /** 以 URL search 唯一来源驱动被测交易页面。 */
  function Harness() {
    const [search, setSearch] = useState(initialSearch);
    return (
      <TransactionsPage
        api={api}
        organizationId="org-a"
        permissions={permissions}
        search={search}
        onSearchChange={(nextSearch) => {
          onSearchChange?.(nextSearch);
          setSearch(nextSearch);
        }}
      />
    );
  }

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    ),
    queryClient,
  };
}

describe("TransactionsPage", () => {
  it("shows transaction timestamps in browser-local time across a UTC+8 date boundary", () => {
    expect(formatTransactionDate("2026-08-23T16:30:00.000Z", -480)).toBe("2026-08-24 00:30");
  });

  it("starts independent reads together and renders loading, empty, and error states", async () => {
    const transactions = deferred<TransactionPage>();
    const ledgers = deferred<LedgerSummary[]>();
    const accounts = deferred<AccountSummary[]>();
    const categories = deferred<CategoryNode[]>();
    const api = createApi({
      listTransactions: vi.fn(() => transactions.promise),
      listLedgers: vi.fn(() => ledgers.promise),
      listAccounts: vi.fn(() => accounts.promise),
      listCategories: vi.fn(() => categories.promise),
    });

    const { queryClient } = renderPage({ api, initialSearch: { ledgerId: ledger.id } });

    expect(screen.getByText("正在加载交易...")).toBeInTheDocument();
    expect(api.listTransactions).toHaveBeenCalledOnce();
    expect(api.listLedgers).toHaveBeenCalledOnce();
    expect(api.listAccounts).toHaveBeenCalledOnce();
    expect(api.listCategories).toHaveBeenCalledOnce();

    await act(async () => {
      transactions.resolve(page([]));
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryState(bookkeepingKeys.transactions("org-a", { ledgerId: ledger.id }))
          ?.status,
      ).toBe("success"),
    );
    expect(screen.getByText("正在加载交易...")).toBeInTheDocument();
    expect(screen.queryByText("没有符合条件的交易。")).not.toBeInTheDocument();
    ledgers.resolve([ledger]);
    accounts.resolve([account]);
    categories.resolve([expenseCategory]);
    expect(await screen.findByText("没有符合条件的交易。")).toBeInTheDocument();

    const failingApi = createApi({
      listTransactions: vi.fn().mockRejectedValue(new Error("offline")),
    });
    renderPage({ api: failingApi });
    expect(await screen.findByText("加载交易失败，请稍后重试。")).toBeInTheDocument();
  });

  it.each([
    ["账本", "listLedgers", [ledger]],
    ["账户", "listAccounts", [account, destinationAccount]],
    ["分类", "listCategories", [expenseCategory, incomeCategory]],
  ] as const)("shows and retries a rejected %s dependency", async (label, method, successValue) => {
    const user = userEvent.setup();
    const dependency = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(successValue);
    const api = createApi({ [method]: dependency });

    renderPage({
      api,
      initialSearch: { ledgerId: ledger.id },
      permissions: ["transactions:read", "transactions:create"],
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(`加载${label}失败，请重试。`);
    expect(screen.queryByText("午餐")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `重试加载${label}` }));

    expect(await screen.findByText("午餐")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "关键词" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增交易" })).toBeInTheDocument();
    expect(dependency).toHaveBeenCalledTimes(2);
  });

  it("uses URL search as the active filter, resets page after filtering, and drives server pagination", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const api = createApi({
      listTransactions: vi.fn(async (query: ListTransactionsQuery = {}) => ({
        ...page(),
        total: 41,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      })),
    });

    renderPage({ api, initialSearch: { keyword: "房租", page: 2, pageSize: 20 }, onSearchChange });
    expect(await screen.findByText("午餐")).toBeInTheDocument();
    expect(api.listTransactions).toHaveBeenCalledWith({ keyword: "房租", page: 2, pageSize: 20 });

    const keyword = screen.getByRole("textbox", { name: "关键词" });
    await user.clear(keyword);
    await user.type(keyword, "餐饮");
    await user.type(screen.getByRole("textbox", { name: "开始日期" }), "2026/08/01");
    await user.type(screen.getByRole("textbox", { name: "结束日期" }), "2026/08/31");
    await user.click(screen.getByRole("button", { name: "应用筛选" }));
    expect(onSearchChange).toHaveBeenLastCalledWith({
      from: "2026-08-01",
      keyword: "餐饮",
      page: undefined,
      pageSize: 20,
      to: "2026-08-31",
    });

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(onSearchChange).toHaveBeenLastCalledWith({
      from: "2026-08-01",
      keyword: "餐饮",
      page: 2,
      pageSize: 20,
      to: "2026-08-31",
    });
  });

  it("creates an expense with an expense category, account, and exact decimal minor amount", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listTransactions: vi.fn().mockResolvedValueOnce(page([])).mockResolvedValue(page()),
    });
    renderPage({
      api,
      permissions: ["transactions:read", "transactions:create", "transactions:update"],
    });
    await screen.findByText("没有符合条件的交易。");

    await user.click(screen.getByRole("button", { name: "新增交易" }));
    await user.click(screen.getByRole("combobox", { name: "交易类型" }));
    await user.click(screen.getByRole("option", { name: "支出" }));
    await user.click(screen.getByRole("combobox", { name: "账户" }));
    await user.click(screen.getByRole("option", { name: "工资卡" }));
    await user.click(screen.getByRole("combobox", { name: "分类" }));
    await user.click(screen.getByRole("option", { name: "餐饮" }));
    await user.type(screen.getByRole("textbox", { name: "金额" }), "12.34");
    const occurredAt = screen.getByLabelText("发生时间");
    await user.clear(occurredAt);
    const occurredAtInput = "2026-08-23T16:30";
    await user.type(occurredAt, occurredAtInput);
    await user.type(screen.getByRole("textbox", { name: "收付款方" }), "面馆");
    await user.click(screen.getByRole("button", { name: "创建交易" }));

    await waitFor(() =>
      expect(api.createTransaction).toHaveBeenCalledWith({
        ledgerId: ledger.id,
        type: "expense",
        accountId: account.id,
        categoryId: expenseCategory.id,
        amountMinor: 1_234,
        occurredAt: new Date(occurredAtInput).toISOString(),
        payee: "面馆",
      }),
    );
    expect(await screen.findByText("午餐")).toBeInTheDocument();
  });

  it("loads categories for the ledger selected in the create form", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listLedgers: vi.fn().mockResolvedValue([ledger, familyLedger]),
      listCategories: vi.fn(async ({ ledgerId: requestedLedgerId }) =>
        requestedLedgerId === familyLedger.id
          ? [familyExpenseCategory]
          : [expenseCategory, incomeCategory],
      ),
      listTransactions: vi.fn().mockResolvedValue(page([])),
    });
    renderPage({ api, permissions: ["transactions:read", "transactions:create"] });
    await screen.findByText("没有符合条件的交易。");

    await user.click(screen.getByRole("button", { name: "新增交易" }));
    await user.click(screen.getByRole("combobox", { name: "账本" }));
    await user.click(screen.getByRole("option", { name: "家庭账本" }));
    await user.click(screen.getByRole("combobox", { name: "账户" }));
    await user.click(screen.getByRole("option", { name: "工资卡" }));
    await user.click(screen.getByRole("combobox", { name: "分类" }));
    await user.click(await screen.findByRole("option", { name: "房租" }));
    await user.type(screen.getByRole("textbox", { name: "金额" }), "12.34");
    await user.click(screen.getByRole("button", { name: "创建交易" }));

    await waitFor(() =>
      expect(api.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          ledgerId: familyLedger.id,
          type: "expense",
          categoryId: familyExpenseCategory.id,
        }),
      ),
    );
  });

  it("clears an incompatible category after type changes and completes an income flow", async () => {
    const user = userEvent.setup();
    const api = createApi({ listTransactions: vi.fn().mockResolvedValue(page([])) });
    renderPage({ api, permissions: ["transactions:read", "transactions:create"] });
    await screen.findByText("没有符合条件的交易。");

    await user.click(screen.getByRole("button", { name: "新增交易" }));
    await user.click(screen.getByRole("combobox", { name: "账户" }));
    await user.click(screen.getByRole("option", { name: "工资卡" }));
    await user.click(screen.getByRole("combobox", { name: "分类" }));
    await user.click(screen.getByRole("option", { name: "餐饮" }));
    await user.type(screen.getByRole("textbox", { name: "金额" }), "88.00");
    await user.click(screen.getByRole("combobox", { name: "交易类型" }));
    await user.click(screen.getByRole("option", { name: "收入" }));
    await user.click(screen.getByRole("button", { name: "创建交易" }));

    expect(await screen.findByText("请选择分类")).toBeInTheDocument();
    expect(api.createTransaction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("combobox", { name: "分类" }));
    await user.click(screen.getByRole("option", { name: "工资" }));
    await user.click(screen.getByRole("button", { name: "创建交易" }));
    await waitFor(() =>
      expect(api.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: "income", categoryId: incomeCategory.id }),
      ),
    );
  });

  it("loads the edited transaction ledger categories instead of the default ledger categories", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listLedgers: vi.fn().mockResolvedValue([ledger, familyLedger]),
      listCategories: vi.fn(async ({ ledgerId: requestedLedgerId }) =>
        requestedLedgerId === familyLedger.id
          ? [familyExpenseCategory]
          : [expenseCategory, incomeCategory],
      ),
      listTransactions: vi.fn().mockResolvedValue(page([familyTransaction])),
    });
    renderPage({
      api,
      permissions: ["transactions:read", "transactions:update"],
    });
    await screen.findByText("家庭房租");

    await user.click(screen.getByRole("button", { name: "编辑 家庭房租" }));
    await user.click(screen.getByRole("combobox", { name: "分类" }));
    expect(await screen.findByRole("option", { name: "房租" })).toBeInTheDocument();
    expect(api.listCategories).toHaveBeenCalledWith({ ledgerId: familyLedger.id });
  });

  it("reopens an edited transaction with the ledger and category returned by the refreshed list", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listLedgers: vi.fn().mockResolvedValue([ledger, familyLedger]),
      listCategories: vi.fn(async ({ ledgerId: requestedLedgerId }) =>
        requestedLedgerId === familyLedger.id
          ? [familyExpenseCategory]
          : [expenseCategory, incomeCategory],
      ),
      listTransactions: vi
        .fn()
        .mockResolvedValueOnce(page())
        .mockResolvedValue(page([familyTransaction])),
      updateTransaction: vi.fn().mockResolvedValue(familyTransaction),
    });
    renderPage({
      api,
      permissions: ["transactions:read", "transactions:update"],
    });
    await screen.findByText("午餐");

    await user.click(screen.getByRole("button", { name: "编辑 午餐" }));
    await user.click(screen.getByRole("combobox", { name: "账本" }));
    await user.click(screen.getByRole("option", { name: "家庭账本" }));
    await user.click(screen.getByRole("combobox", { name: "分类" }));
    await user.click(await screen.findByRole("option", { name: "房租" }));
    await user.click(screen.getByRole("button", { name: "保存交易" }));

    expect(await screen.findByText("家庭房租")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑 家庭房租" }));
    expect(screen.getByRole("combobox", { name: "账本" })).toHaveTextContent("家庭账本");
    expect(screen.getByRole("combobox", { name: "分类" })).toHaveTextContent("房租");
    await user.click(screen.getByRole("combobox", { name: "分类" }));
    await user.click(screen.getByRole("option", { name: "房租" }));
    await user.click(screen.getByRole("button", { name: "保存交易" }));

    await waitFor(() => expect(api.updateTransaction).toHaveBeenCalledTimes(2));
    expect(api.updateTransaction).toHaveBeenLastCalledWith(
      familyTransaction.id,
      expect.objectContaining({
        ledgerId: familyLedger.id,
        categoryId: familyExpenseCategory.id,
      }),
    );
  });

  it("resets draft values when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const api = createApi({ listTransactions: vi.fn().mockResolvedValue(page([])) });
    renderPage({ api, permissions: ["transactions:read", "transactions:create"] });
    await screen.findByText("没有符合条件的交易。");

    await user.click(screen.getByRole("button", { name: "新增交易" }));
    await user.type(screen.getByRole("textbox", { name: "金额" }), "12.34");
    await user.click(screen.getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: "新增交易" }));

    expect(screen.getByRole("textbox", { name: "金额" })).toHaveValue("");
  });

  it("requires a different destination for transfers and submits no category", async () => {
    const user = userEvent.setup();
    const api = createApi({ listTransactions: vi.fn().mockResolvedValue(page([])) });
    renderPage({ api, permissions: ["transactions:read", "transactions:create"] });
    await screen.findByText("没有符合条件的交易。");

    await user.click(screen.getByRole("button", { name: "新增交易" }));
    await user.click(screen.getByRole("combobox", { name: "交易类型" }));
    await user.click(screen.getByRole("option", { name: "转账" }));
    await user.click(screen.getByRole("combobox", { name: "账户" }));
    await user.click(screen.getByRole("option", { name: "工资卡" }));
    await user.click(screen.getByRole("combobox", { name: "目标账户" }));
    await user.click(screen.getByRole("option", { name: "工资卡" }));
    await user.type(screen.getByRole("textbox", { name: "金额" }), "12.34");
    await user.click(screen.getByRole("button", { name: "创建交易" }));
    expect(await screen.findByText("转账账户必须不同")).toBeInTheDocument();
    expect(api.createTransaction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("combobox", { name: "目标账户" }));
    await user.click(screen.getByRole("option", { name: "现金" }));
    await user.click(screen.getByRole("button", { name: "创建交易" }));
    await waitFor(() =>
      expect(api.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "transfer",
          accountId: account.id,
          destinationAccountId: destinationAccount.id,
          amountMinor: 1_234,
        }),
      ),
    );
    expect(api.createTransaction).toHaveBeenCalledWith(
      expect.not.objectContaining({ categoryId: expect.anything() }),
    );
  });

  it("fills exact edit values and deletes only after confirmation", async () => {
    const user = userEvent.setup();
    const updated = { ...transaction, note: "修改后" };
    const api = createApi({
      listTransactions: vi
        .fn()
        .mockResolvedValueOnce(page())
        .mockResolvedValueOnce(page([updated]))
        .mockResolvedValue(page([])),
      updateTransaction: vi.fn().mockResolvedValue(updated),
    });
    renderPage({
      api,
      permissions: ["transactions:read", "transactions:update", "transactions:delete"],
    });
    await screen.findByText("午餐");

    await user.click(screen.getByRole("button", { name: "编辑 午餐" }));
    expect(screen.getByRole("textbox", { name: "金额" })).toHaveValue("12.34");
    expect(screen.getByRole("textbox", { name: "收付款方" })).toHaveValue("面馆");
    const localOccurredAt = new Date(transaction.occurredAt);
    const expectedLocalDateTime = `${localOccurredAt.getFullYear()}-${String(
      localOccurredAt.getMonth() + 1,
    ).padStart(2, "0")}-${String(localOccurredAt.getDate()).padStart(2, "0")}T${String(
      localOccurredAt.getHours(),
    ).padStart(2, "0")}:${String(localOccurredAt.getMinutes()).padStart(2, "0")}`;
    expect(screen.getByLabelText("发生时间")).toHaveValue(expectedLocalDateTime);
    const note = screen.getByRole("textbox", { name: "备注" });
    await user.clear(note);
    await user.type(note, "修改后");
    await user.click(screen.getByRole("button", { name: "保存交易" }));
    await waitFor(() =>
      expect(api.updateTransaction).toHaveBeenCalledWith(transaction.id, expect.anything()),
    );

    await user.click(screen.getByRole("button", { name: "删除 修改后" }));
    expect(api.deleteTransaction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(api.deleteTransaction).toHaveBeenCalledWith(transaction.id));
    expect(await screen.findByText("没有符合条件的交易。")).toBeInTheDocument();
  });

  it("hides writes from viewers and hides delete from members", async () => {
    const viewer = renderPage({ api: createApi() });
    await screen.findByText("午餐");
    expect(screen.queryByRole("button", { name: "新增交易" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑 午餐" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 午餐" })).not.toBeInTheDocument();
    viewer.unmount();

    renderPage({
      api: createApi(),
      permissions: ["transactions:read", "transactions:create", "transactions:update"],
    });
    await screen.findByText("午餐");
    expect(screen.getByRole("button", { name: "新增交易" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑 午餐" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 午餐" })).not.toBeInTheDocument();
  });
});
