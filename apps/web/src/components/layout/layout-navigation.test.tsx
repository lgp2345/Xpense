import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode, CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/components/app-providers";
import { SidebarProvider } from "@/components/ui/sidebar";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";

const organization = {
  id: "org-1",
  name: "个人账本",
  baseCurrency: "CNY",
  timezone: "Asia/Shanghai",
  status: "active" as const,
};
const organizationContext: CurrentUserResponse = {
  accessScope: "organization",
  user: {
    id: "user-1",
    email: "owner@example.com",
    phone: null,
    isSuperAdmin: true,
    status: "active",
    initialPasswordUnchanged: false,
  },
  organization,
  role: null,
  permissions: [],
  session: { id: "session-1", clientType: "web_pc" },
};
const businessMenu: AuthorizedMenuNode = {
  id: 1,
  parentId: null,
  type: "menu",
  name: "交易记录",
  sortOrder: 0,
  icon: "ReceiptText",
  isVisible: true,
  routeKey: "Transactions",
  path: "/transactions",
  url: null,
  permissionCode: "transactions:read",
  isExternal: false,
  keepAlive: false,
  children: [],
};

async function setup(context = organizationContext) {
  const store = createAuthStore({ accessToken: "test-access" });
  const session = createWebSession({ authStore: store });
  const listOrganizations = vi
    .spyOn(session.authApi, "listOrganizations")
    .mockResolvedValue([{ id: organization.id, name: organization.name, status: "active" }]);
  vi.spyOn(session.iamApi, "getAuthorizedMenus").mockResolvedValue([businessMenu]);
  store.getState().setCurrentUserContext(context);
  if (context.organization) {
    await session.menuStore
      .getState()
      .loadMenusForOrganization(context.organization.id, session.iamApi.getAuthorizedMenus);
  }
  const root = createRootRoute({
    component: () => (
      <SidebarProvider>
        <AppSidebar session={session} />
        <Header session={session} />
        <Outlet />
      </SidebarProvider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren(
      ["/", "/transactions", "/platform/organizations", "/system/menu-reset"].map((path) =>
        createRoute({ getParentRoute: () => root, path, component: () => <p>页面内容</p> }),
      ),
    ),
    history: createMemoryHistory({
      initialEntries: [
        context.accessScope === "platform" ? "/platform/organizations" : "/transactions",
      ],
    }),
  });
  function show() {
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );
  }
  return { store, session, router, listOrganizations, show };
}

describe("统一侧栏导航", () => {
  it("超级管理员从组织菜单末尾进入平台页面并保留当前组织", async () => {
    const h = await setup();
    h.show();
    const transactions = await screen.findByRole("link", { name: "交易记录" });
    const organizations = screen.getByRole("link", { name: "组织管理" });
    const reset = screen.getByRole("link", { name: "菜单恢复" });
    expect(
      transactions.compareDocumentPosition(organizations) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      organizations.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(screen.queryByRole("button", { name: "返回平台" })).not.toBeInTheDocument();

    await userEvent.click(organizations);
    await waitFor(() => expect(h.router.state.location.pathname).toBe("/platform/organizations"));
    expect(organizations).toHaveAttribute("data-active", "true");
    expect(h.store.getState()).toMatchObject({
      accessScope: "organization",
      currentOrganization: organization,
    });
    expect(screen.getByRole("link", { name: "交易记录" })).toBeVisible();

    await userEvent.click(reset);
    await waitFor(() => expect(h.router.state.location.pathname).toBe("/system/menu-reset"));
    expect(reset).toHaveAttribute("data-active", "true");
    expect(organizations).toHaveAttribute("data-active", "false");
  });

  it("普通成员不显示平台管理菜单", async () => {
    const h = await setup({
      ...organizationContext,
      user: { ...organizationContext.user, isSuperAdmin: false },
    });
    h.show();
    expect(await screen.findByRole("link", { name: "交易记录" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "组织管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "菜单恢复" })).not.toBeInTheDocument();
  });

  it("平台页通过与组织页相同的切换器选择组织并进入工作区", async () => {
    const h = await setup({
      ...organizationContext,
      accessScope: "platform",
      organization: null,
      role: null,
    });
    vi.spyOn(h.session.authApi, "switchOrganization").mockResolvedValue({
      accessToken: "organization-access",
    });
    vi.spyOn(h.session.authApi, "getCurrentUser").mockResolvedValue(organizationContext);
    h.show();
    await userEvent.click(await screen.findByRole("button", { name: /未选择组织/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: organization.name }));
    await waitFor(() => expect(h.router.state.location.pathname).toBe("/"));
    expect(h.store.getState()).toMatchObject({
      accessScope: "organization",
      currentOrganization: organization,
    });
    expect(await screen.findByRole("link", { name: "交易记录" })).toBeVisible();
  });

  it("平台页加载组织失败时可重试", async () => {
    const h = await setup({
      ...organizationContext,
      accessScope: "platform",
      organization: null,
      role: null,
    });
    h.listOrganizations.mockRejectedValueOnce(new Error("offline"));
    h.show();
    await userEvent.click(await screen.findByRole("button", { name: /未选择组织/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "重试加载组织" }));
    await userEvent.click(screen.getByRole("button", { name: /未选择组织/ }));
    expect(await screen.findByRole("menuitem", { name: organization.name })).toBeVisible();
  });
});
