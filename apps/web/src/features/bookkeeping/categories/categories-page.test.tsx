import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, render as testingRender, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryNode, LedgerSummary } from "@xpense/shared";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { BookkeepingApi } from "../../../services/bookkeeping-api";
import { CategoriesPage } from "./categories-page";

const ledger: LedgerSummary = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "个人账本",
  type: "personal",
  isDefault: true,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
};
const child: CategoryNode = {
  id: "323e4567-e89b-42d3-a456-426614174000",
  ledgerId: ledger.id,
  type: "expense",
  parentId: "223e4567-e89b-42d3-a456-426614174000",
  name: "早餐",
  icon: null,
  color: null,
  sortOrder: 0,
  children: [],
};
const expenseRoot: CategoryNode = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  ledgerId: ledger.id,
  type: "expense",
  parentId: null,
  name: "餐饮",
  icon: null,
  color: null,
  sortOrder: 0,
  children: [child],
};
const incomeRoot: CategoryNode = {
  ...expenseRoot,
  id: "423e4567-e89b-42d3-a456-426614174000",
  type: "income",
  name: "工资",
  children: [],
};

/** 创建带分类默认响应且允许覆盖单个边界的测试 API。 */
function createApi(overrides: Partial<BookkeepingApi> = {}) {
  return {
    listLedgers: vi.fn().mockResolvedValue([ledger]),
    listPersonalLedgers: vi.fn().mockResolvedValue([ledger]),
    listCategories: vi.fn().mockResolvedValue([expenseRoot, incomeRoot]),
    createCategory: vi.fn().mockResolvedValue(child),
    updateCategory: vi.fn().mockResolvedValue(expenseRoot),
    deleteCategory: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as BookkeepingApi;
}

/** 创建可由测试精确控制完成顺序的 Promise。 */
function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

/** 为每个分类页面测试创建关闭重试的独立查询缓存。 */
function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return testingRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("CategoriesPage", () => {
  it("loads ledger choices through the personal-ledger boundary", async () => {
    const api = createApi({ listLedgers: vi.fn().mockRejectedValue(new Error("raw ledgers")) });

    render(
      <CategoriesPage
        api={api}
        organizationId="org-a"
        permissions={["categories:read", "ledgers:read"]}
      />,
    );

    expect(await screen.findByText("餐饮")).toBeInTheDocument();
    expect(api.listPersonalLedgers).toHaveBeenCalledOnce();
    expect(api.listLedgers).not.toHaveBeenCalled();
  });

  it("deduplicates ledger and category reads for the same organization", async () => {
    const api = createApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <CategoriesPage api={api} organizationId="org-a" permissions={["categories:read"]} />
        <CategoriesPage api={api} organizationId="org-a" permissions={["categories:read"]} />
      </QueryClientProvider>,
    );

    expect(await screen.findAllByText("餐饮")).toHaveLength(2);
    expect(api.listPersonalLedgers).toHaveBeenCalledOnce();
    expect(api.listCategories).toHaveBeenCalledOnce();
  });

  it("loads the default ledger and renders two-level income and expense tabs", async () => {
    const user = userEvent.setup();
    const api = createApi();

    render(
      <CategoriesPage
        api={api}
        organizationId="org-a"
        permissions={["categories:read", "ledgers:read"]}
      />,
    );

    expect(await screen.findByText("餐饮")).toBeInTheDocument();
    expect(screen.getByText("早餐")).toBeInTheDocument();
    expect(screen.queryByText("工资")).not.toBeInTheDocument();
    expect(api.listCategories).toHaveBeenCalledWith({ ledgerId: ledger.id });

    await user.click(screen.getByRole("tab", { name: "收入分类" }));

    expect(screen.getByText("工资")).toBeInTheDocument();
    expect(screen.queryByText("餐饮")).not.toBeInTheDocument();
  });

  it("ignores an older ledger response that resolves after the latest selection", async () => {
    const user = userEvent.setup();
    const ledgerB = {
      ...ledger,
      id: "523e4567-e89b-42d3-a456-426614174000",
      name: "家庭账本",
      isDefault: false,
    };
    const staleB = [
      {
        ...expenseRoot,
        id: "623e4567-e89b-42d3-a456-426614174000",
        ledgerId: ledgerB.id,
        name: "旧家庭分类",
        children: [],
      },
    ];
    const latestA = [{ ...expenseRoot, name: "最新个人分类", children: [] }];
    const requestB = createDeferred<CategoryNode[]>();
    const requestA = createDeferred<CategoryNode[]>();
    const api = createApi({
      listPersonalLedgers: vi.fn().mockResolvedValue([ledger, ledgerB]),
      listCategories: vi
        .fn()
        .mockResolvedValueOnce([expenseRoot])
        .mockImplementationOnce(() => requestB.promise)
        .mockImplementationOnce(() => requestA.promise),
    });

    render(
      <CategoriesPage
        api={api}
        organizationId="org-a"
        permissions={["categories:read", "ledgers:read"]}
      />,
    );
    await screen.findByText("餐饮");
    await user.click(screen.getByRole("combobox", { name: "账本" }));
    await user.click(screen.getByRole("option", { name: "家庭账本" }));
    await user.click(screen.getByRole("combobox", { name: "账本" }));
    await user.click(screen.getByRole("option", { name: "个人账本" }));

    requestA.resolve(latestA);
    expect(await screen.findByText("最新个人分类")).toBeInTheDocument();
    requestB.resolve(staleB);
    await waitFor(() => expect(screen.queryByText("旧家庭分类")).not.toBeInTheDocument());
    expect(screen.getByText("最新个人分类")).toBeInTheDocument();
  });

  it("creates a child under its selected root with inherited ledger and type", async () => {
    const user = userEvent.setup();
    const newChild = { ...child, id: "523e4567-e89b-42d3-a456-426614174000", name: "午餐" };
    const api = createApi({
      listCategories: vi
        .fn()
        .mockResolvedValueOnce([expenseRoot, incomeRoot])
        .mockResolvedValueOnce([{ ...expenseRoot, children: [child, newChild] }, incomeRoot]),
      createCategory: vi.fn().mockResolvedValue(newChild),
    });

    render(
      <CategoriesPage
        api={api}
        organizationId="org-a"
        permissions={["categories:read", "categories:create", "ledgers:read"]}
      />,
    );
    await screen.findByText("餐饮");
    await user.click(screen.getByRole("button", { name: "在 餐饮 下新增子分类" }));
    await user.type(screen.getByRole("textbox", { name: "分类名称" }), "午餐");
    await user.click(screen.getByRole("button", { name: "创建分类" }));

    await waitFor(() =>
      expect(api.createCategory).toHaveBeenCalledWith({
        ledgerId: ledger.id,
        type: "expense",
        parentId: expenseRoot.id,
        name: "午餐",
        icon: undefined,
        color: undefined,
        sortOrder: 0,
      }),
    );
    expect(await screen.findByText("午餐")).toBeInTheDocument();
  });

  it("lists only top-level categories as parent options and preserves input after validation error", async () => {
    const user = userEvent.setup();
    const api = createApi({
      createCategory: vi.fn().mockRejectedValue(new Error("duplicate")),
    });

    render(
      <CategoriesPage
        api={api}
        organizationId="org-a"
        permissions={["categories:read", "categories:create", "ledgers:read"]}
      />,
    );
    await screen.findByText("餐饮");
    await user.click(screen.getByRole("button", { name: "新增分类" }));
    await user.type(screen.getByRole("textbox", { name: "分类名称" }), "重复分类");
    await user.click(screen.getByRole("combobox", { name: "上级分类" }));

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "餐饮" })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: "早餐" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "创建分类" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存分类失败");
    expect(screen.getByRole("textbox", { name: "分类名称" })).toHaveValue("重复分类");
  });

  it("shows client validation errors instead of silently ignoring an invalid category", async () => {
    const user = userEvent.setup();

    render(
      <CategoriesPage
        api={createApi()}
        organizationId="org-a"
        permissions={["categories:read", "categories:create", "ledgers:read"]}
      />,
    );
    await screen.findByText("餐饮");
    await user.click(screen.getByRole("button", { name: "新增分类" }));
    await user.click(screen.getByRole("button", { name: "创建分类" }));

    expect(await screen.findByText("请输入分类名称")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "颜色" }), "red");
    await user.clear(screen.getByRole("textbox", { name: "排序" }));
    await user.type(screen.getByRole("textbox", { name: "排序" }), "1.5");

    expect(await screen.findByText("颜色格式不正确")).toBeInTheDocument();
    expect(await screen.findByText("排序值必须是有效整数")).toBeInTheDocument();
  });

  it("keeps a parent row when the server rejects its deletion", async () => {
    const user = userEvent.setup();
    const api = createApi({ deleteCategory: vi.fn().mockRejectedValue(new Error("has children")) });

    render(
      <CategoriesPage
        api={api}
        organizationId="org-a"
        permissions={["categories:read", "categories:delete", "ledgers:read"]}
      />,
    );
    await screen.findByText("餐饮");
    await user.click(screen.getByRole("button", { name: "删除 餐饮" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(
      await screen.findByText("删除分类失败，请先处理其子分类或交易引用。"),
    ).toBeInTheDocument();
    expect(screen.getByText("餐饮")).toBeInTheDocument();
    expect(api.listCategories).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a successful category delete from a failed follow-up refresh", async () => {
    const user = userEvent.setup();
    const api = createApi({
      listCategories: vi
        .fn()
        .mockResolvedValueOnce([expenseRoot])
        .mockRejectedValueOnce(new Error("offline")),
    });

    render(
      <CategoriesPage
        api={api}
        organizationId="org-a"
        permissions={["categories:read", "categories:delete", "ledgers:read"]}
      />,
    );
    await screen.findByText("餐饮");
    await user.click(screen.getByRole("button", { name: "删除 餐饮" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "分类已删除，但刷新列表失败，请重试。",
    );
    expect(api.deleteCategory).toHaveBeenCalledOnce();
    expect(screen.getByText("餐饮")).toBeInTheDocument();
  });

  it("hides category write actions from a viewer", async () => {
    render(
      <CategoriesPage
        api={createApi()}
        organizationId="org-a"
        permissions={["categories:read", "ledgers:read"]}
      />,
    );

    await screen.findByText("餐饮");
    expect(screen.queryByRole("button", { name: "新增分类" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑 餐饮" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 餐饮" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "在 餐饮 下新增子分类" })).not.toBeInTheDocument();
  });
});
