import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode, PermissionKey, RouteKey } from "@xpense/shared";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { createAppRouter } from "@/router";
import type { BookkeepingApi, ListTransactionsQuery } from "@/services/bookkeeping-api";
import type { WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { createMenuStore } from "@/stores/menu-store";
import { Route as AccountsRoute } from "./accounts";
import { Route as CategoriesRoute } from "./categories";
import { Route as TransactionsRoute, validateTransactionSearch } from "./transactions";

const ledgerId = "123e4567-e89b-42d3-a456-426614174000";
const accountId = "223e4567-e89b-42d3-a456-426614174000";
const categoryId = "323e4567-e89b-42d3-a456-426614174000";

afterEach(() => cleanup());

function authorizedMenu(routeKey: RouteKey, id: number, keepAlive = false): AuthorizedMenuNode {
  return {
    id,
    parentId: null,
    type: "menu",
    name: routeKey,
    sortOrder: id,
    icon: null,
    isVisible: true,
    routeKey,
    path: `/${routeKey.toLowerCase()}`,
    url: null,
    permissionCode: null,
    isExternal: false,
    keepAlive,
    children: [],
  } as unknown as AuthorizedMenuNode;
}

function createSession(
  permissions: PermissionKey[] = [
    "transactions:read",
    "transactions:create",
    "accounts:read",
    "accounts:create",
    "categories:read",
    "categories:create",
  ],
  bookkeepingApi: Partial<BookkeepingApi> = {},
  keepAlive = false,
): WebSessionDependency {
  const menus = ["Transactions", "Accounts", "Categories"].map((routeKey, index) =>
    authorizedMenu(routeKey as RouteKey, index + 1, keepAlive && routeKey === "Transactions"),
  );
  const menuStore = createMenuStore();
  menuStore.setState({
    organizationId: "org-bookkeeping",
    status: "ready",
    tree: menus,
    byRouteKey: Object.fromEntries(menus.map((menu) => [menu.routeKey, menu])),
    error: null,
  });
  const authStore = createAuthStore({
    accessToken: "access-token",
    currentUser: {
      id: "user-1",
      email: "owner@example.com",
      isSuperAdmin: false,
      status: "active",
    },
    currentOrganization: { id: "org-bookkeeping", name: "个人账本" },
    role: { id: "role-1", key: "owner", name: "所有者" },
    permissions,
    session: { id: "session-1", clientType: "web_pc" },
    status: "authenticated",
  });
  const api = {
    listLedgers: vi.fn().mockResolvedValue([]),
    listPersonalLedgers: vi.fn().mockResolvedValue([
      {
        id: ledgerId,
        name: "个人账本",
        type: "personal",
        isDefault: true,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ]),
    listAccounts: vi.fn().mockResolvedValue([
      {
        id: accountId,
        name: "工资卡",
        type: "bank",
        icon: null,
        color: null,
        sortOrder: 0,
        balanceMinor: 0,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ]),
    listCategories: vi.fn().mockResolvedValue([]),
    listTransactions: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    ...bookkeepingApi,
  } as unknown as BookkeepingApi;

  return {
    authApi: {
      listOrganizations: vi.fn().mockResolvedValue([]),
    } as unknown as WebSessionDependency["authApi"],
    authStore,
    bookkeepingApi: api,
    iamApi: {
      getAuthorizedMenus: vi.fn().mockResolvedValue(menus),
      resolveMenuRoute: vi.fn(),
    } as unknown as WebSessionDependency["iamApi"],
    menuStore,
    rentalApi: {} as WebSessionDependency["rentalApi"],
    restoreSession: vi.fn().mockResolvedValue(true),
  };
}

function renderRoute(path: string, session = createSession()) {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    session,
  });
  render(
    <AppProviders queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, session };
}

describe("bookkeeping file routes", () => {
  it("exports the full transaction search normalization contract", () => {
    expectTypeOf<typeof validateTransactionSearch>().toEqualTypeOf<
      (search: Record<string, unknown>) => ListTransactionsQuery
    >();
    expect(
      validateTransactionSearch({
        ledgerId,
        accountId,
        categoryId,
        type: "expense",
        keyword: "  房租  ",
        from: "2026-08-01",
        to: "2026-08-31",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      ledgerId,
      accountId,
      categoryId,
      type: "expense",
      keyword: "房租",
      from: "2026-08-01",
      to: "2026-08-31",
      page: 2,
      pageSize: 50,
    });
    expect(
      validateTransactionSearch({
        type: "excluded_inflow",
        ledgerId: "ledger-1",
        accountId: "account-1",
        categoryId: "category-1",
        keyword: "   ",
        from: "2026-02-30",
        to: "not-a-date",
        page: 0,
        pageSize: 101,
      }),
    ).toEqual({});
  });

  it("keeps route metadata on all bookkeeping file routes", () => {
    expect((TransactionsRoute.options as { path?: string }).path).toBe("/transactions");
    expect((AccountsRoute.options as { path?: string }).path).toBe("/accounts");
    expect((CategoriesRoute.options as { path?: string }).path).toBe("/categories");
    expect(TransactionsRoute.options.staticData).toEqual({ routeKey: "Transactions" });
    expect(AccountsRoute.options.staticData).toEqual({ routeKey: "Accounts" });
    expect(CategoriesRoute.options.staticData).toEqual({ routeKey: "Categories" });
  });

  it.each([
    ["/transactions", "交易记录", "transactions:create", "新增交易"],
    ["/accounts", "账户管理", "accounts:create", "新增账户"],
    ["/categories", "分类管理", "categories:create", "新增分类"],
  ] as const)("renders %s through the injected bookkeeping session", async (path, heading, permission, action) => {
    const api = {
      listTransactions: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    };
    const { session } = renderRoute(path, createSession([permission], api));

    expect(
      await screen.findByRole("heading", { name: heading }, { timeout: 3_000 }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(session.authStore.getState().currentOrganization?.id).toBe("org-bookkeeping"),
    );
    if (path === "/transactions") {
      expect(await screen.findByRole("button", { name: action })).toBeInTheDocument();
      expect(api.listTransactions).toHaveBeenCalled();
    }
  });

  it("updates the search closure in place when pagination changes an alive transaction route", async () => {
    const user = userEvent.setup();
    const listTransactions = vi.fn(async (query: ListTransactionsQuery = {}) => ({
      items: [
        {
          id: "transaction-1",
          ledgerId,
          ledgerName: "个人账本",
          type: "expense" as const,
          accountId,
          accountName: "工资卡",
          destinationAccountId: null,
          destinationAccountName: null,
          categoryId: null,
          categoryName: null,
          amountMinor: 100,
          occurredAt: "2026-08-01T00:00:00.000Z",
          payee: null,
          note: "房租",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      total: 40,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    }));
    const { router, session } = renderRoute(
      "/transactions?page=1&keyword=%E6%88%BF%E7%A7%9F",
      createSession(undefined, { listTransactions }, true),
    );

    expect(
      await screen.findByRole("heading", { name: "交易记录" }, { timeout: 3_000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("第 1 页，共 40 笔", {}, { timeout: 3_000 }),
    ).toBeInTheDocument();
    const keywordInput = screen.getByLabelText("关键词");
    expect(keywordInput).toHaveValue("房租");
    await user.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ keyword: "房租", page: 2, pageSize: 20 });
      expect(screen.getByText("第 2 页，共 40 笔")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("关键词")).toBe(keywordInput);
    expect(screen.getByLabelText("关键词")).toHaveValue("房租");
    expect(listTransactions).toHaveBeenLastCalledWith({ keyword: "房租", page: 2, pageSize: 20 });
    expect(session.authStore.getState().currentOrganization?.id).toBe("org-bookkeeping");
  });
});
