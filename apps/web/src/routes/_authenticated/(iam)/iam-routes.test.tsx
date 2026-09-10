import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode, PermissionKey, RouteKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../components/app-providers";
import { createAppRouter } from "../../../router";
import type { IamApi } from "../../../services/iam-api";
import type { WebSessionDependency } from "../../../services/web-session";
import { createAuthStore } from "../../../stores/auth-store";
import { createMenuStore } from "../../../stores/menu-store";
import { Route as DashboardRoute } from "../(core)/index";
import { Route as AuditLogsRoute } from "./audit-logs";
import { Route as MembersRoute } from "./members";
import { Route as MenusRoute } from "./menus";
import { Route as RolesRoute } from "./roles";
import { Route as SessionsRoute } from "./sessions";

const expected = {
  Dashboard: "/",
  Members: "/members",
  Roles: "/roles",
  Sessions: "/sessions",
  AuditLogs: "/audit-logs",
  Menus: "/menus",
} as const;

const permissions: PermissionKey[] = [
  "dashboard:read",
  "members:read",
  "members:create",
  "roles:read",
  "roles:update",
  "roles:permissions:update",
  "sessions:read",
  "sessions:revoke",
  "audit_logs:read",
  "menus:read",
  "menus:create",
  "menus:update",
  "menus:delete",
];

function authorizedMenu(routeKey: RouteKey, id: number): AuthorizedMenuNode {
  return {
    id,
    parentId: null,
    type: "menu",
    name: routeKey,
    sortOrder: id,
    icon: null,
    isVisible: true,
    routeKey,
    path: expected[routeKey as keyof typeof expected] ?? `/${routeKey.toLowerCase()}`,
    url: null,
    permissionCode: null,
    isExternal: false,
    keepAlive: false,
    children: [],
  } as unknown as AuthorizedMenuNode;
}

function createSession(overrides: Partial<WebSessionDependency> = {}): WebSessionDependency {
  const menus = Object.keys(expected).map((routeKey, index) =>
    authorizedMenu(routeKey as RouteKey, index + 1),
  );
  const menuStore = createMenuStore();
  menuStore.setState({
    organizationId: "org-1",
    status: "ready",
    tree: menus,
    byRouteKey: Object.fromEntries(menus.map((menu) => [menu.routeKey, menu])),
    error: null,
  });
  return {
    authApi: {
      listOrganizations: vi.fn().mockResolvedValue([]),
      listSessions: vi.fn().mockResolvedValue([]),
      revokeAllSessions: vi.fn().mockResolvedValue(undefined),
      revokeSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as WebSessionDependency["authApi"],
    authStore: createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "owner", name: "所有者" },
      permissions,
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    }),
    bookkeepingApi: {
      getMonthlyStatistics: vi.fn().mockResolvedValue({
        incomeMinor: 100,
        expenseMinor: 20,
        netMinor: 80,
        currency: "CNY",
        expenseCategories: [],
      }),
    } as unknown as WebSessionDependency["bookkeepingApi"],
    iamApi: {
      listMembers: vi.fn().mockResolvedValue([]),
      listRoles: vi.fn().mockResolvedValue([]),
      getPermissionTree: vi.fn().mockResolvedValue([]),
      listAuditLogs: vi.fn().mockResolvedValue([]),
      addMenu: vi.fn().mockResolvedValue(undefined),
      deleteMenu: vi.fn().mockResolvedValue(undefined),
      editMenu: vi.fn().mockResolvedValue(undefined),
      editMenuOrder: vi.fn().mockResolvedValue(undefined),
      getMenuConfiguration: vi.fn().mockResolvedValue([]),
      getAuthorizedMenus: vi.fn().mockResolvedValue(menus),
    } as unknown as IamApi,
    menuStore,
    rentalApi: {} as WebSessionDependency["rentalApi"],
    restoreSession: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function renderRoute(path: string, session = createSession()) {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    session,
  });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, session };
}

describe("Dashboard and IAM file routes", () => {
  it("maps every migrated route to its exact URL", () => {
    expect((DashboardRoute.options as { path?: string }).path).toBe(expected.Dashboard);
    expect((MembersRoute.options as { path?: string }).path).toBe(expected.Members);
    expect((RolesRoute.options as { path?: string }).path).toBe(expected.Roles);
    expect((SessionsRoute.options as { path?: string }).path).toBe(expected.Sessions);
    expect((AuditLogsRoute.options as { path?: string }).path).toBe(expected.AuditLogs);
    expect((MenusRoute.options as { path?: string }).path).toBe(expected.Menus);
  });

  it("renders Dashboard with the injected bookkeeping API and organization", async () => {
    const { session } = renderRoute("/");

    expect(await screen.findByRole("heading", { name: "仪表盘" })).toBeInTheDocument();
    await waitFor(() =>
      expect(session.bookkeepingApi.getMonthlyStatistics).toHaveBeenCalledWith(
        expect.objectContaining({ month: expect.any(String) }),
      ),
    );
  });

  it("renders Members with the injected IAM API and permissions", async () => {
    const { session } = renderRoute("/members");

    expect(await screen.findByRole("heading", { name: "成员管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增成员" })).toBeInTheDocument();
    await waitFor(() => expect(session.iamApi.listMembers).toHaveBeenCalledOnce());
  });

  it("validates AuditLogs search and replaces the URL on filter changes", async () => {
    const user = userEvent.setup();
    await import("@/features/audit/audit-logs-page");
    const { router, session } = renderRoute("/audit-logs?page=2");

    expect(await screen.findByRole("heading", { name: "审计日志" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("操作"), "role.created");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/audit-logs");
      expect(router.state.location.search).toMatchObject({ action: "role.created" });
    });
    expect(session.iamApi.listAuditLogs).toHaveBeenCalled();
  });

  it("renders Menus and refreshes authorized menus for the current organization", async () => {
    const user = userEvent.setup();
    const session = createSession();
    const getAuthorizedMenus = vi.fn().mockResolvedValue([authorizedMenu("Menus", 1)]);
    session.iamApi.getAuthorizedMenus = getAuthorizedMenus;
    session.iamApi.getMenuConfiguration = vi.fn().mockResolvedValue([]);
    const { router } = renderRoute("/menus", session);

    expect(await screen.findByRole("heading", { name: "菜单管理" })).toBeInTheDocument();
    expect(session.iamApi.getMenuConfiguration).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "新增根节点" }));
    await user.type(screen.getByRole("textbox", { name: "名称" }), "配置中心");
    await user.click(screen.getByRole("button", { name: "创建节点" }));

    await waitFor(() => expect(getAuthorizedMenus).toHaveBeenCalledOnce());
    expect(session.menuStore.getState()).toMatchObject({
      organizationId: "org-1",
      status: "ready",
    });
    expect(router.state.location.pathname).toBe("/menus");
  });
});
