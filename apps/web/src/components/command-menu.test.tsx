import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode, CurrentUserResponse } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";

vi.stubGlobal(
  "ResizeObserver",
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
);

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

const userContext: CurrentUserResponse = {
  user: { id: "user-1", email: "owner@example.com", isSuperAdmin: false, status: "active" },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members:read"],
  session: { id: "session-1", clientType: "web_pc" },
};

const authorizedMenus: AuthorizedMenuNode[] = [
  {
    id: 1,
    parentId: null,
    type: "directory",
    name: "访问控制",
    sortOrder: 0,
    icon: "ShieldCheck",
    isVisible: true,
    routeKey: null,
    path: null,
    url: null,
    permissionCode: null,
    isExternal: null,
    keepAlive: null,
    children: [
      {
        id: 2,
        parentId: 1,
        type: "menu",
        name: "成员",
        sortOrder: 0,
        icon: "Users",
        isVisible: true,
        routeKey: "Members",
        path: "/members",
        url: null,
        permissionCode: "members:read",
        isExternal: false,
        keepAlive: false,
        children: [],
      },
    ],
  },
  {
    id: 3,
    parentId: null,
    type: "menu",
    name: "产品文档",
    sortOrder: 10,
    icon: "Shield",
    isVisible: true,
    routeKey: null,
    path: null,
    url: "https://docs.example.com",
    permissionCode: "members:read",
    isExternal: true,
    keepAlive: null,
    children: [],
  },
  {
    id: 6,
    parentId: null,
    type: "directory",
    name: "备用入口",
    sortOrder: 20,
    icon: "ShieldCheck",
    isVisible: true,
    routeKey: null,
    path: null,
    url: null,
    permissionCode: null,
    isExternal: null,
    keepAlive: null,
    children: [
      {
        id: 7,
        parentId: 6,
        type: "menu",
        name: "成员",
        sortOrder: 0,
        icon: "ShieldCheck",
        isVisible: true,
        routeKey: "Roles",
        path: "/roles",
        url: null,
        permissionCode: "roles:read",
        isExternal: false,
        keepAlive: false,
        children: [],
      },
    ],
  },
];

describe("CommandMenu", () => {
  it("通过快捷键打开，并且不展示未授权路由", async () => {
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onAny().reply(200, { code: "OK", message: "ok", data: authorizedMenus });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const rootRoute = createRootRoute({
      component: () => <AuthenticatedLayout session={session} />,
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <main>受保护内容</main>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const dialog = await screen.findByRole("dialog");
    const dialogQueries = within(dialog);
    expect(dialogQueries.getAllByRole("option", { name: "成员" })).toHaveLength(2);
    expect(dialogQueries.queryByText("角色")).not.toBeInTheDocument();
    expect(dialogQueries.queryByText("会话")).not.toBeInTheDocument();
    expect(dialogQueries.queryByText("审计日志")).not.toBeInTheDocument();
  });

  it("用安全的新窗口参数打开动态外链", async () => {
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onAny().reply(200, { code: "OK", message: "ok", data: authorizedMenus });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const rootRoute = createRootRoute({
      component: () => <AuthenticatedLayout session={session} />,
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <main>受保护内容</main>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("option", { name: "产品文档" }));

    expect(open).toHaveBeenCalledWith("https://docs.example.com", "_blank", "noopener,noreferrer");
  });

  it.each([
    ["第一个", "{Enter}", "/members"],
    ["第二个", "{ArrowDown}{Enter}", "/roles"],
  ])("可用键盘选择%s同名动态菜单", async (_label, selectionKeys, expectedPath) => {
    const user = userEvent.setup();
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onAny().reply(200, { code: "OK", message: "ok", data: authorizedMenus });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const rootRoute = createRootRoute({
      component: () => <AuthenticatedLayout session={session} />,
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <main>首页</main>,
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      component: () => <main>成员页面</main>,
    });
    const rolesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/roles",
      component: () => <main>角色页面</main>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, membersRoute, rolesRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("搜索命令..."), "成员");
    const options = within(dialog).getAllByRole("option", { name: "成员" });

    expect(options.map((option) => option.getAttribute("data-value"))).toEqual([
      "menu-2",
      "menu-7",
    ]);

    await user.keyboard(selectionKeys);

    await waitFor(() => expect(router.state.location.pathname).toBe(expectedPath));
  });
});
