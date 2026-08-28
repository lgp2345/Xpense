import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ROUTE_DEFINITIONS, type RouteKey } from "@xpense/shared";
import type * as TypeScript from "typescript";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { AuditLogSearch } from "../features/audit/audit-log-filters";
import type { BookkeepingApi, ListTransactionsQuery } from "../services/bookkeeping-api";
import type { IamApi } from "../services/iam-api";
import type { WebSessionDependency } from "../services/web-session";
import { createAuthStore } from "../stores/auth-store";
import { createMenuStore } from "../stores/menu-store";
import { ROUTE_REGISTRY } from "./route-registry";

const require = createRequire(import.meta.url);
const ts: typeof TypeScript = require("typescript");
const ledgerId = "123e4567-e89b-42d3-a456-426614174000";
const accountId = "223e4567-e89b-42d3-a456-426614174000";
const categoryId = "323e4567-e89b-42d3-a456-426614174000";

/** 创建可由测试精确控制完成顺序的 Promise。 */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("ROUTE_REGISTRY", () => {
  it("registers every shared route key exactly once", () => {
    expect(Object.keys(ROUTE_REGISTRY).sort()).toEqual(Object.keys(ROUTE_DEFINITIONS).sort());
  });

  it.each(
    Object.keys(ROUTE_DEFINITIONS) as RouteKey[],
  )("keeps the exact shared path and routeKey metadata for %s", (routeKey) => {
    const registration = ROUTE_REGISTRY[routeKey];

    expect((registration.route.options as { path?: string }).path).toBe(
      ROUTE_DEFINITIONS[routeKey].path,
    );
    expect(registration.route.options.staticData).toEqual({ routeKey });
  });

  it("retains TanStack's typed params and validated audit-log search", () => {
    // biome-ignore lint/complexity/noBannedTypes: TanStack uses {} for a static route with no params.
    expectTypeOf<typeof ROUTE_REGISTRY.Members.route.types.allParams>().toEqualTypeOf<{}>();
    expectTypeOf<
      typeof ROUTE_REGISTRY.AuditLogs.route.types.fullSearchSchema
    >().toEqualTypeOf<AuditLogSearch>();
    expectTypeOf<Parameters<typeof ROUTE_REGISTRY.AuditLogs.render>[0]["params"]>().toEqualTypeOf<
      typeof ROUTE_REGISTRY.AuditLogs.route.types.allParams
    >();
    expectTypeOf<
      Parameters<typeof ROUTE_REGISTRY.AuditLogs.render>[0]["search"]
    >().toEqualTypeOf<AuditLogSearch>();

    const validateSearch = ROUTE_REGISTRY.AuditLogs.route.options.validateSearch;

    expect(typeof validateSearch).toBe("function");
    if (typeof validateSearch !== "function") {
      return;
    }

    expect(
      validateSearch({
        action: "role.created",
        actorUserId: "user-1",
        from: "2026-08-01",
        page: "2",
        targetType: "role",
        to: "2026-08-12",
      }),
    ).toEqual({
      action: "role.created",
      actorUserId: "user-1",
      from: "2026-08-01",
      page: 2,
      targetType: "role",
      to: "2026-08-12",
    });
  });

  it("normalizes transaction URL filters and drops invalid values", () => {
    expectTypeOf<
      typeof ROUTE_REGISTRY.Transactions.route.types.fullSearchSchema
    >().toEqualTypeOf<ListTransactionsQuery>();
    const validateSearch = ROUTE_REGISTRY.Transactions.route.options.validateSearch;

    expect(typeof validateSearch).toBe("function");
    if (typeof validateSearch !== "function") {
      return;
    }

    expect(
      validateSearch({
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
      validateSearch({
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

  it.each([
    ["Accounts", "accounts:create", "新增账户"],
    ["Categories", "categories:create", "新增分类"],
    ["Transactions", "transactions:create", "新增交易"],
  ] as const)("projects current write permissions into the %s page adapter", async (routeKey, permission, writeAction) => {
    const authStore = createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "viewer", name: "查看者" },
      permissions: [],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const input = {
      navigate: vi.fn(),
      params: {},
      search: {},
      session: {
        authStore,
        bookkeepingApi: {
          listAccounts: vi.fn().mockResolvedValue([
            {
              id: accountId,
              name: "工资卡",
              type: "bank",
              icon: null,
              color: null,
              sortOrder: 0,
              balanceMinor: 0,
              createdAt: "2026-08-23T00:00:00.000Z",
              updatedAt: "2026-08-23T00:00:00.000Z",
            },
          ]),
          listCategories: vi.fn().mockResolvedValue([]),
          listTransactions: vi.fn().mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
          }),
          listLedgers: vi.fn().mockResolvedValue([
            {
              id: ledgerId,
              name: "个人账本",
              type: "personal",
              isDefault: true,
              createdAt: "2026-08-23T00:00:00.000Z",
              updatedAt: "2026-08-23T00:00:00.000Z",
            },
          ]),
          listPersonalLedgers: vi.fn().mockResolvedValue([
            {
              id: ledgerId,
              name: "个人账本",
              type: "personal",
              isDefault: true,
              createdAt: "2026-08-23T00:00:00.000Z",
              updatedAt: "2026-08-23T00:00:00.000Z",
            },
          ]),
        },
      },
    } as unknown as Parameters<(typeof ROUTE_REGISTRY)[typeof routeKey]["render"]>[0];
    const firstQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={firstQueryClient}>
        {ROUTE_REGISTRY[routeKey].render(input as never)}
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole(
        "heading",
        { name: ROUTE_REGISTRY[routeKey].label },
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: writeAction })).not.toBeInTheDocument();
    unmount();

    authStore.setState((state) => ({ ...state, permissions: [permission] }));
    const secondQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={secondQueryClient}>
        {ROUTE_REGISTRY[routeKey].render(input as never)}
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: writeAction })).toBeInTheDocument();
  });

  it("switches the Accounts adapter to the new organization without showing a late old response", async () => {
    const organizationA = deferred<Awaited<ReturnType<BookkeepingApi["listAccounts"]>>>();
    const organizationB = deferred<Awaited<ReturnType<BookkeepingApi["listAccounts"]>>>();
    const listAccounts = vi
      .fn()
      .mockImplementationOnce(() => organizationA.promise)
      .mockImplementationOnce(() => organizationB.promise);
    const authStore = createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-a", name: "组织 A" },
      role: { id: "role-1", key: "viewer", name: "查看者" },
      permissions: ["accounts:read"],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const input = {
      navigate: vi.fn(),
      params: {},
      search: {},
      session: {
        authStore,
        bookkeepingApi: { listAccounts },
      },
    } as unknown as Parameters<typeof ROUTE_REGISTRY.Accounts.render>[0];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        {ROUTE_REGISTRY.Accounts.render(input)}
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(1));

    authStore.setState((state) => ({
      ...state,
      currentOrganization: { id: "org-b", name: "组织 B" },
    }));
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2));
    organizationB.resolve([
      {
        id: accountId,
        name: "组织 B 账户",
        type: "bank",
        icon: null,
        color: null,
        sortOrder: 0,
        balanceMinor: 0,
        createdAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z",
      },
    ]);
    expect(await screen.findByText("组织 B 账户")).toBeInTheDocument();

    organizationA.resolve([
      {
        id: accountId,
        name: "组织 A 旧账户",
        type: "bank",
        icon: null,
        color: null,
        sortOrder: 0,
        balanceMinor: 0,
        createdAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z",
      },
    ]);
    await waitFor(() => expect(screen.queryByText("组织 A 旧账户")).not.toBeInTheDocument());
    expect(screen.getByText("组织 B 账户")).toBeInTheDocument();
  });

  it("switches the Categories adapter to the new organization without showing a late old response", async () => {
    const organizationA = deferred<Awaited<ReturnType<BookkeepingApi["listCategories"]>>>();
    const organizationB = deferred<Awaited<ReturnType<BookkeepingApi["listCategories"]>>>();
    const listCategories = vi
      .fn()
      .mockImplementationOnce(() => organizationA.promise)
      .mockImplementationOnce(() => organizationB.promise);
    const authStore = createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-a", name: "组织 A" },
      role: { id: "role-1", key: "viewer", name: "查看者" },
      permissions: ["categories:read", "ledgers:read"],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const input = {
      navigate: vi.fn(),
      params: {},
      search: {},
      session: {
        authStore,
        bookkeepingApi: {
          listCategories,
          listLedgers: vi.fn().mockResolvedValue([
            {
              id: ledgerId,
              name: "个人账本",
              type: "personal",
              isDefault: true,
              createdAt: "2026-08-23T00:00:00.000Z",
              updatedAt: "2026-08-23T00:00:00.000Z",
            },
          ]),
          listPersonalLedgers: vi.fn().mockResolvedValue([
            {
              id: ledgerId,
              name: "个人账本",
              type: "personal",
              isDefault: true,
              createdAt: "2026-08-23T00:00:00.000Z",
              updatedAt: "2026-08-23T00:00:00.000Z",
            },
          ]),
        },
      },
    } as unknown as Parameters<typeof ROUTE_REGISTRY.Categories.render>[0];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        {ROUTE_REGISTRY.Categories.render(input)}
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listCategories).toHaveBeenCalledTimes(1));

    authStore.setState((state) => ({
      ...state,
      currentOrganization: { id: "org-b", name: "组织 B" },
    }));
    await waitFor(() => expect(listCategories).toHaveBeenCalledTimes(2));
    organizationB.resolve([
      {
        id: categoryId,
        ledgerId,
        type: "expense",
        parentId: null,
        name: "组织 B 分类",
        icon: null,
        color: null,
        sortOrder: 0,
        children: [],
      },
    ]);
    expect(await screen.findByText("组织 B 分类")).toBeInTheDocument();

    organizationA.resolve([
      {
        id: categoryId,
        ledgerId,
        type: "expense",
        parentId: null,
        name: "组织 A 旧分类",
        icon: null,
        color: null,
        sortOrder: 0,
        children: [],
      },
    ]);
    await waitFor(() => expect(screen.queryByText("组织 A 旧分类")).not.toBeInTheDocument());
    expect(screen.getByText("组织 B 分类")).toBeInTheDocument();
  });

  it("renders the lazy menu page and wires its configuration and authorized-menu refresh", async () => {
    const user = userEvent.setup();
    const configuredDirectory = {
      id: 1,
      parentId: null,
      type: "directory",
      name: "配置中心",
      sortOrder: 0,
      icon: null,
      isVisible: true,
      routeKey: null,
      path: null,
      url: null,
      permissionCode: null,
      isExternal: null,
      keepAlive: null,
      children: [],
    } as const;
    const getMenuConfiguration = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([configuredDirectory]);
    const getAuthorizedMenus = vi.fn().mockResolvedValue([]);
    const addMenu = vi.fn().mockResolvedValue(undefined);
    const authStore = createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "owner", name: "所有者" },
      permissions: ["menus:read", "menus:create", "menus:update", "menus:delete"],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const menuStore = createMenuStore();
    const session = {
      authApi: {},
      authStore,
      iamApi: {
        addMenu,
        deleteMenu: vi.fn(),
        editMenu: vi.fn(),
        editMenuOrder: vi.fn(),
        getAuthorizedMenus,
        getMenuConfiguration,
      } as unknown as IamApi,
      menuStore,
      restoreSession: vi.fn(),
    } as unknown as WebSessionDependency;
    const input = {
      navigate: vi.fn(),
      params: {},
      search: {},
      session,
    } as unknown as Parameters<typeof ROUTE_REGISTRY.Menus.render>[0];

    render(ROUTE_REGISTRY.Menus.render(input));

    expect(await screen.findByRole("heading", { name: "菜单管理" })).toBeInTheDocument();
    expect(getMenuConfiguration).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "新增根节点" }));
    await user.type(screen.getByRole("textbox", { name: "名称" }), "配置中心");
    await user.click(screen.getByRole("button", { name: "创建节点" }));

    expect(await screen.findByText("配置中心")).toBeInTheDocument();
    await waitFor(() => expect(getAuthorizedMenus).toHaveBeenCalledOnce());
    expect(menuStore.getState()).toMatchObject({
      organizationId: "org-1",
      status: "ready",
    });
  });

  it("keeps every page module behind a React.lazy dynamic import", () => {
    const expectedPageModules = new Set([
      "../features/audit/audit-logs-page",
      "../features/bookkeeping/accounts/accounts-page",
      "../features/bookkeeping/transactions/transactions-page",
      "../features/bookkeeping/categories/categories-page",
      "../features/members/members-page",
      "../features/menus/menu-management-page",
      "../features/roles/roles-page",
      "../features/sessions/sessions-page",
      "../pages/dashboard-page",
    ]);
    const sourceText = readFileSync(resolve("src/routes/route-registry.tsx"), "utf8");
    const sourceFile = ts.createSourceFile(
      "route-registry.tsx",
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const staticallyImportedPageModules = new Set<string>();
    const lazilyImportedPageModules = new Set<string>();

    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        expectedPageModules.has(statement.moduleSpecifier.text) &&
        !statement.importClause?.isTypeOnly
      ) {
        staticallyImportedPageModules.add(statement.moduleSpecifier.text);
      }
    }

    /** 遍历语法树并收集真实 React.lazy 动态导入。 */
    function visit(node: TypeScript.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "lazy"
      ) {
        const lazyFactory = node.arguments[0];

        if (lazyFactory) {
          const collectDynamicImports = (child: TypeScript.Node) => {
            if (
              ts.isCallExpression(child) &&
              child.expression.kind === ts.SyntaxKind.ImportKeyword &&
              child.arguments[0] &&
              ts.isStringLiteral(child.arguments[0]) &&
              expectedPageModules.has(child.arguments[0].text)
            ) {
              lazilyImportedPageModules.add(child.arguments[0].text);
            }
            ts.forEachChild(child, collectDynamicImports);
          };

          collectDynamicImports(lazyFactory);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    expect(staticallyImportedPageModules).toEqual(new Set());
    expect(lazilyImportedPageModules).toEqual(expectedPageModules);
  });
});
