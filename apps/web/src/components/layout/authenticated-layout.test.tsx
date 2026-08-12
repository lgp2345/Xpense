import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode, CurrentUserResponse } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";

import { AppProviders } from "@/components/app-providers";
import { createWebSession, type WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";

import { AuthenticatedLayout } from "./authenticated-layout";

const userContext: CurrentUserResponse = {
  user: { id: "user-1", email: "owner@example.com", isSuperAdmin: false, status: "active" },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members:read"],
  session: { id: "session-1", clientType: "web_pc" },
};

function ConditionalAuthenticatedLayout({ session }: { session: WebSessionDependency }) {
  const isAuthenticated = useStore(session.authStore, (state) => state.status === "authenticated");

  return isAuthenticated ? (
    <AuthenticatedLayout requiresMenuBootstrap={false} session={session} />
  ) : (
    <p>已退出</p>
  );
}

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
];

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe("AuthenticatedLayout", () => {
  it("呈现当前会话的组织、邮箱与获授权导航控制项", async () => {
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    const menuResponse = createDeferred<[number, unknown]>();
    mock.onGet("http://localhost:4000/menus").reply(() => menuResponse.promise);
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const menuLoad = session.menuStore
      .getState()
      .loadMenusForOrganization("org-1", session.iamApi.getAuthorizedMenus);
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

    expect(await screen.findByText("正在加载组织菜单...")).toBeInTheDocument();
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument();

    await act(async () => {
      menuResponse.resolve([200, { code: "OK", message: "ok", data: authorizedMenus }]);
      await menuLoad;
    });

    expect(await screen.findByText("个人账本")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "成员" })).toHaveAttribute("href", "/members");
    expect(screen.queryByRole("link", { name: "角色" })).not.toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="trigger"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换主题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "搜索命令" })).toBeInTheDocument();
    expect(mock.history.get.filter(({ url }) => url?.endsWith("/menus"))).toHaveLength(1);
  });

  it("菜单加载失败时保留认证并允许原地重试", async () => {
    const user = userEvent.setup();
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock
      .onGet("http://localhost:4000/menus")
      .replyOnce(400, { code: "VALIDATION_FAILED", message: "failed", data: null })
      .onGet("http://localhost:4000/menus")
      .reply(200, { code: "OK", message: "ok", data: authorizedMenus });
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    await session.menuStore
      .getState()
      .loadMenusForOrganization("org-1", session.iamApi.getAuthorizedMenus);
    const rootRoute = createRootRoute({
      component: () => <AuthenticatedLayout session={session} />,
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <main>重试后的内容</main>,
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

    expect(await screen.findByRole("alert")).toHaveTextContent("菜单加载失败，请稍后重试。");
    expect(store.getState().status).toBe("authenticated");
    expect(screen.queryByText("重试后的内容")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("重试后的内容")).toBeInTheDocument();
    expect(mock.history.get.filter(({ url }) => url?.endsWith("/menus"))).toHaveLength(2);
  });

  it("组织切换失败后恢复旧菜单并显示全局错误反馈", async () => {
    const user = userEvent.setup();
    const store = createAuthStore({ accessToken: "org-1-access" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/menus$/).reply(200, { code: "OK", message: "ok", data: authorizedMenus });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    vi.spyOn(session.authApi, "listOrganizations").mockResolvedValue([
      { id: "org-1", name: "个人账本", status: "active" },
      { id: "org-2", name: "家庭账本", status: "active" },
    ]);
    vi.spyOn(session.authApi, "switchOrganization").mockRejectedValue(new Error("switch failed"));
    const getAuthorizedMenus = vi
      .spyOn(session.iamApi, "getAuthorizedMenus")
      .mockResolvedValue(authorizedMenus);
    await session.menuStore
      .getState()
      .loadMenusForOrganization("org-1", session.iamApi.getAuthorizedMenus);
    const rootRoute = createRootRoute({
      component: () => <AuthenticatedLayout session={session} />,
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <main>组织内容</main>,
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

    await user.click(await screen.findByRole("button", { name: /个人账本/ }));
    await user.click(await screen.findByRole("menuitem", { name: "家庭账本" }));

    expect(await screen.findByText("切换组织失败，请稍后重试。")).toBeInTheDocument();
    expect(await screen.findByText("组织内容")).toBeInTheDocument();
    expect(session.menuStore.getState()).toMatchObject({
      organizationId: "org-1",
      status: "ready",
    });
    expect(getAuthorizedMenus).toHaveBeenCalledOnce();
    expect(mock.history.get.filter(({ url }) => url?.endsWith("/menus"))).toHaveLength(1);
  });

  it("恢复路由可绕过菜单门控，但匿名会话仍不能呈现受保护内容", async () => {
    const store = createAuthStore();
    const session = createWebSession({ authStore: store, baseUrl: "http://localhost:4000" });
    const rootRoute = createRootRoute({
      component: () => <AuthenticatedLayout requiresMenuBootstrap={false} session={session} />,
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <main>静态恢复内容</main>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    const view = render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(screen.queryByText("静态恢复内容")).not.toBeInTheDocument();

    store.getState().setAccessToken("access-token");
    store.getState().setCurrentUserContext(userContext);
    view.rerender(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(await screen.findByText("静态恢复内容")).toBeInTheDocument();
  });

  it("在退出请求失败且壳层卸载后仍显示全局错误反馈", async () => {
    const user = userEvent.setup();
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    let rejectLogout: (reason?: unknown) => void = () => undefined;
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onPost(/\/auth\/logout$/).reply(
      () =>
        new Promise<[number, unknown]>((_resolve, reject) => {
          rejectLogout = reject;
        }),
    );
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const rootRoute = createRootRoute({
      component: () => <ConditionalAuthenticatedLayout session={session} />,
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

    await user.click(await screen.findByRole("button", { name: /owner@example.com/ }));
    await user.click(screen.getByRole("menuitem", { name: "退出登录" }));

    expect(await screen.findByText("已退出")).toBeInTheDocument();

    await act(async () => rejectLogout(new Error("logout failed")));

    expect(await screen.findByText("退出登录失败，请稍后重试。")).toBeInTheDocument();
  });
});
