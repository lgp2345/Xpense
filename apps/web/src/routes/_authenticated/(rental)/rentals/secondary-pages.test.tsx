import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type AuthorizedMenuNode,
  type PermissionKey,
  ROUTE_DEFINITIONS,
  type RouteKey,
  rentalPropertyBillingPermissions,
} from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/components/app-providers";
import { billsApiFixture, financeApiFixture } from "@/features/rental/bills/bill-test-fixtures";
import { createAppRouter } from "@/router";
import { ApiError } from "@/services/api-client";
import type { WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { createMenuStore } from "@/stores/menu-store";

const draftId = "123e4567-e89b-42d3-a456-426614174000";
const pages = [
  {
    path: "/rentals/tenants/tenant",
    title: "租客详情",
    parent: "租客管理",
    fallback: "/rentals/tenants",
    loading: "正在加载租客详情...",
    error: "租客不存在或已删除。",
  },
  {
    path: "/rentals/contracts/contract",
    title: "合同详情",
    parent: "合同管理",
    fallback: "/rentals/contracts",
    loading: "正在加载合同详情...",
    error: "合同不存在或已删除。",
  },
  {
    path: `/rentals/contracts/new?draftId=${draftId}`,
    title: "新建合同",
    parent: "合同管理",
    fallback: "/rentals/contracts",
    loading: "正在加载合同草稿...",
    error: "操作失败，请稍后重试。",
  },
  {
    path: "/rentals/bills/bill",
    title: "账单详情",
    parent: "账单查询",
    fallback: "/rentals/bills",
    loading: "正在读取账单详情…",
    error: "账单不存在或无权访问。",
  },
  {
    path: "/rentals/settlements/contract",
    title: "退租结算",
    parent: "合同管理",
    fallback: "/rentals/contracts/contract",
    loading: "正在读取退租结算…",
    error: "退租结算读取失败。",
  },
  {
    path: "/rentals/properties/property?view=billing",
    title: "房产 · 账单",
    parent: "房产管理",
    current: "账单",
    fallback: "/rentals/properties",
    loading: null,
    error: "账单列表读取失败，请重试。",
  },
];

function createSession(mode: "pending" | "error" = "pending"): WebSessionDependency {
  const tree = Object.entries(ROUTE_DEFINITIONS).map(([routeKey, route], index) => ({
    id: index + 1,
    parentId: null,
    type: "menu",
    name: routeKey,
    sortOrder: index,
    icon: null,
    isVisible: true,
    routeKey: routeKey as RouteKey,
    path: route.path,
    url: null,
    permissionCode: "dashboard:read",
    isExternal: false,
    keepAlive: true,
    children: [],
  })) as AuthorizedMenuNode[];
  const menuStore = createMenuStore();
  menuStore.setState({
    organizationId: "org",
    status: "ready",
    tree,
    byRouteKey: Object.fromEntries(tree.map((menu) => [menu.routeKey, menu])),
    error: null,
  });
  const load = () =>
    mode === "pending"
      ? new Promise<never>(() => {})
      : Promise.reject(new ApiError(404, "NOT_FOUND", "missing"));
  const emptyPage = { items: [], total: 0, page: 1, pageSize: 20 };
  return {
    authApi: { listOrganizations: vi.fn().mockResolvedValue([]) } as never,
    authStore: createAuthStore({
      status: "authenticated",
      currentOrganization: { id: "org", name: "组织" },
      permissions: [
        ...new Set<PermissionKey>([
          "rental_tenants:read",
          "rental_contracts:read",
          "rental_contracts:create",
          "rental_contracts:update",
          "rental_bills:read",
          "rental_settlements:read",
          "rental_properties:read",
          ...rentalPropertyBillingPermissions,
        ]),
      ],
    }),
    bookkeepingApi: {} as never,
    iamApi: { getAuthorizedMenus: vi.fn().mockResolvedValue(tree) } as never,
    menuStore,
    rentalApi: {
      tenantDetail: vi.fn(load),
      contractDetail: vi.fn(load),
      getProperty: vi.fn(load),
      updateContract: vi.fn(),
      checkContractAvailability: vi.fn(),
      confirmContract: vi.fn(),
      createConfirmedContract: vi.fn(),
      listProperties: vi.fn().mockResolvedValue(emptyPage),
      listTenants: vi.fn().mockResolvedValue(emptyPage),
      listContracts: vi.fn().mockResolvedValue(emptyPage),
    } as never,
    rentalBillsApi: billsApiFixture({ getBill: vi.fn(load) }),
    rentalFinanceApi: financeApiFixture({
      listPropertyBilling: vi.fn(load),
      getSettlement: vi.fn(load),
    }),
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

describe("二级页面导航", () => {
  it.each(pages)("直接打开 $title，加载时可通过返回箭头离开", async (page) => {
    const { router } = renderRoute(page.path);
    await screen.findByRole("heading", { name: page.title, level: 1 });
    if (page.loading) await screen.findByText(page.loading);
    const breadcrumb = screen.getByRole("navigation", { name: "面包屑" });
    expect(within(breadcrumb).getByText(page.current ?? page.title)).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(breadcrumb).getByRole("link", { name: page.parent })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(page.fallback));
  });

  it.each(pages)("$title 请求失败后仍保留面包屑和返回入口", async (page) => {
    const { router } = renderRoute(page.path, createSession("error"));
    await screen.findByText(page.error);
    expect(screen.getByRole("heading", { name: page.title, level: 1 })).toBeInTheDocument();
    const breadcrumb = screen.getByRole("navigation", { name: "面包屑" });
    await userEvent.click(within(breadcrumb).getByRole("link", { name: page.parent }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        page.fallback.startsWith("/rentals/contracts/") ? "/rentals/contracts" : page.fallback,
      ),
    );
  });

  it.each(pages)("从其他页面进入 $title 后返回真实来源并恢复筛选", async (page) => {
    const { router } = renderRoute("/rentals/tenants?keyword=来源&page=2");
    await screen.findByRole("heading", { name: "租客管理" });
    await act(async () => {
      await router.navigate({ href: page.path });
    });
    await screen.findByRole("heading", { name: page.title, level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/rentals/tenants"));
    expect(router.state.location.search).toMatchObject({ keyword: "来源", page: 2 });
  });

  it("退租结算展示三级面包屑，可直接打开所属合同", async () => {
    const { router } = renderRoute("/rentals/settlements/contract");
    const breadcrumb = await screen.findByRole("navigation", { name: "面包屑" });
    await userEvent.click(within(breadcrumb).getByRole("link", { name: "合同详情" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/rentals/contracts/contract"));
  });

  it.each([
    "返回箭头",
    "面包屑",
  ])("合同表单有未保存内容时，%s 离开须确认，取消后保留输入", async (entry) => {
    const session = createSession();
    vi.mocked(session.rentalApi.listProperties).mockResolvedValue({
      items: [{ id: draftId, name: "测试房产", isActive: true }],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never);
    const { router } = renderRoute("/rentals/contracts/new", session);
    await userEvent.click(await screen.findByRole("combobox", { name: "房产" }));
    await userEvent.click(await screen.findByRole("option", { name: "测试房产" }));
    const leave = () =>
      entry === "返回箭头"
        ? userEvent.click(screen.getByRole("button", { name: "返回上一页" }))
        : userEvent.click(
            within(screen.getByRole("navigation", { name: "面包屑" })).getByRole("link", {
              name: "合同管理",
            }),
          );
    await leave();
    await screen.findByRole("alertdialog", { name: "离开合同创建？" });
    expect(router.state.location.pathname).toBe("/rentals/contracts/new");
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "房产" })).toHaveTextContent("测试房产");
    await leave();
    await userEvent.click(await screen.findByRole("button", { name: "离开并丢弃" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/rentals/contracts"));
    expect(session.rentalApi.createConfirmedContract).not.toHaveBeenCalled();
  });

  it("菜单恢复工具页具有导航，直接进入时返回首页", async () => {
    const session = createSession();
    session.authStore.setState({
      currentUser: {
        id: "admin",
        email: "admin@example.test",
        phone: null,
        isSuperAdmin: true,
        status: "active",
      },
    });
    const { router } = renderRoute("/system/menu-reset", session);
    await screen.findByRole("heading", { name: "菜单恢复", level: 1 });
    expect(
      within(screen.getByRole("navigation", { name: "面包屑" })).getByRole("link", {
        name: "首页",
      }),
    ).toHaveAttribute("href", "/");
    await userEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});
