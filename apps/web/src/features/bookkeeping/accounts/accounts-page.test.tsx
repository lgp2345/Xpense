import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AccountSummary } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { BookkeepingApi } from "../../../services/bookkeeping-api";
import { parseDecimalAmountToMinor } from "./account-form-schema";
import { AccountsPage } from "./accounts-page";

const account: AccountSummary = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "工资卡",
  type: "bank",
  icon: null,
  color: "#2563EB",
  sortOrder: 0,
  balanceMinor: 1_234,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
};

function createApi(overrides: Partial<BookkeepingApi> = {}) {
  return {
    listAccounts: vi.fn().mockResolvedValue([account]),
    createAccount: vi.fn().mockResolvedValue(account),
    updateAccount: vi.fn().mockResolvedValue(account),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as BookkeepingApi;
}

describe("parseDecimalAmountToMinor", () => {
  it.each([
    ["12.34", 1_234],
    ["-12.3", -1_230],
    ["0", 0],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("converts the decimal string %s without floating multiplication", (input, expected) => {
    expect(parseDecimalAmountToMinor(input)).toBe(expected);
  });

  it.each([
    "",
    "1,000",
    "1e3",
    "12.345",
    "+12.00",
    "90071992547409.92",
  ])("rejects the unsafe or non-decimal amount %s", (input) => {
    expect(() => parseDecimalAmountToMinor(input)).toThrow();
  });
});

describe("AccountsPage", () => {
  it("shows loading state and renders derived CNY balances", async () => {
    let resolveAccounts: ((accounts: AccountSummary[]) => void) | undefined;
    const api = createApi({
      listAccounts: vi.fn(
        () =>
          new Promise<AccountSummary[]>((resolve) => {
            resolveAccounts = resolve;
          }),
      ),
    });

    render(<AccountsPage api={api} permissions={["accounts:read"]} />);

    expect(screen.getByText("正在加载账户...")).toBeInTheDocument();
    resolveAccounts?.([account]);

    expect(await screen.findByText("工资卡")).toBeInTheDocument();
    expect(screen.getByText("¥12.34")).toBeInTheDocument();
  });

  it("renders positive and negative safe-integer boundary balances without losing cents", async () => {
    const api = createApi({
      listAccounts: vi.fn().mockResolvedValue([
        {
          ...account,
          id: "523e4567-e89b-42d3-a456-426614174000",
          balanceMinor: Number.MAX_SAFE_INTEGER,
        },
        {
          ...account,
          id: "623e4567-e89b-42d3-a456-426614174000",
          name: "负债",
          balanceMinor: Number.MIN_SAFE_INTEGER,
        },
      ]),
    });

    render(<AccountsPage api={api} permissions={["accounts:read"]} />);

    expect(await screen.findByText("¥90,071,992,547,409.91")).toBeInTheDocument();
    expect(screen.getByText("-¥90,071,992,547,409.91")).toBeInTheDocument();
  });

  it("creates an account with a string-parsed opening balance and refreshes", async () => {
    const user = userEvent.setup();
    const created = { ...account, name: "现金账户", type: "cash" as const };
    const api = createApi({
      listAccounts: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([created]),
      createAccount: vi.fn().mockResolvedValue(created),
    });

    render(
      <AccountsPage
        api={api}
        permissions={["accounts:read", "accounts:create", "accounts:update", "accounts:delete"]}
      />,
    );
    await screen.findByText("当前没有账户。");
    await user.click(screen.getByRole("button", { name: "新增账户" }));
    await user.type(screen.getByRole("textbox", { name: "账户名称" }), "现金账户");
    await user.click(screen.getByRole("combobox", { name: "账户类型" }));
    await user.click(screen.getByRole("option", { name: "现金" }));
    await user.type(screen.getByRole("textbox", { name: "期初余额" }), "12.34");
    await user.click(screen.getByRole("button", { name: "创建账户" }));

    await waitFor(() =>
      expect(api.createAccount).toHaveBeenCalledWith({
        name: "现金账户",
        type: "cash",
        initialBalanceMinor: 1_234,
      }),
    );
    expect(await screen.findByText("现金账户")).toBeInTheDocument();
    expect(api.listAccounts).toHaveBeenCalledTimes(2);
  });

  it("preserves entered values and shows the server failure in the dialog", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listAccounts: vi.fn().mockResolvedValue([]),
      createAccount: vi.fn().mockRejectedValue(new Error("conflict")),
    });

    render(<AccountsPage api={api} permissions={["accounts:read", "accounts:create"]} />);
    await screen.findByText("当前没有账户。");
    await user.click(screen.getByRole("button", { name: "新增账户" }));
    await user.type(screen.getByRole("textbox", { name: "账户名称" }), "重复账户");
    await user.click(screen.getByRole("button", { name: "创建账户" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存账户失败");
    expect(screen.getByRole("textbox", { name: "账户名称" })).toHaveValue("重复账户");
  });

  it("updates and deletes an account only after confirmed server success", async () => {
    const user = userEvent.setup();
    const updated = { ...account, name: "日常银行卡" };
    const api = createApi({
      listAccounts: vi
        .fn()
        .mockResolvedValueOnce([account])
        .mockResolvedValueOnce([updated])
        .mockResolvedValueOnce([]),
      updateAccount: vi.fn().mockResolvedValue(updated),
    });

    render(
      <AccountsPage
        api={api}
        permissions={["accounts:read", "accounts:update", "accounts:delete"]}
      />,
    );
    await screen.findByText("工资卡");
    await user.click(screen.getByRole("button", { name: "编辑 工资卡" }));
    const nameInput = screen.getByRole("textbox", { name: "账户名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "日常银行卡");
    await user.click(screen.getByRole("button", { name: "保存账户" }));

    await waitFor(() =>
      expect(api.updateAccount).toHaveBeenCalledWith(account.id, {
        name: "日常银行卡",
        type: "bank",
        color: "#2563EB",
        icon: null,
        sortOrder: 0,
      }),
    );
    expect(await screen.findByText("日常银行卡")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除 日常银行卡" }));
    expect(api.deleteAccount).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(api.deleteAccount).toHaveBeenCalledWith(account.id));
    expect(await screen.findByText("当前没有账户。")).toBeInTheDocument();
  });

  it("distinguishes a successful delete from a failed follow-up refresh", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listAccounts: vi
        .fn()
        .mockResolvedValueOnce([account])
        .mockRejectedValueOnce(new Error("offline")),
    });

    render(<AccountsPage api={api} permissions={["accounts:read", "accounts:delete"]} />);
    await screen.findByText("工资卡");
    await user.click(screen.getByRole("button", { name: "删除 工资卡" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "账户已删除，但刷新列表失败，请重试。",
    );
    expect(api.deleteAccount).toHaveBeenCalledOnce();
    expect(screen.getByText("工资卡")).toBeInTheDocument();
  });

  it("hides every write action from a viewer", async () => {
    render(<AccountsPage api={createApi()} permissions={["accounts:read"]} />);

    await screen.findByText("工资卡");
    expect(screen.queryByRole("button", { name: "新增账户" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑 工资卡" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 工资卡" })).not.toBeInTheDocument();
  });
});
