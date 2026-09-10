import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode, CurrentUserResponse } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";

import { AppProviders } from "@/components/app-providers";
import type { RegisteredPageDescriptor } from "@/routes/-shared/registered-page";
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
        id: 4,
        parentId: 1,
        type: "directory",
        name: "安全",
        sortOrder: 0,
        icon: "Shield",
        isVisible: true,
        routeKey: null,
        path: null,
        url: null,
        permissionCode: null,
        isExternal: null,
        keepAlive: null,
        children: [
          {
            id: 5,
            parentId: 4,
            type: "menu",
            name: "会话",
            sortOrder: 0,
            icon: "MonitorSmartphone",
            isVisible: true,
            routeKey: "Sessions",
            path: "/sessions",
            url: null,
            permissionCode: "sessions:read",
            isExternal: false,
            keepAlive: false,
            children: [],
          },
        ],
      },
      {
        id: 2,
        parentId: 1,
        type: "menu",
        name: "成员",
        sortOrder: 10,
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

function DescriptorProbe({ search, session }: { search: string; session: WebSessionDependency }) {
  return (
    <section data-testid="cached-probe">
      <p data-testid="descriptor-session">{session === undefined ? "missing" : "provided"}</p>
      <p data-testid="descriptor-search">{search}</p>
      <input aria-label="descriptor input" />
    </section>
  );
}

function registeredMenu(routeKey: "Members" | "Transactions", id: number): AuthorizedMenuNode {
  return {
    id,
    parentId: null,
    type: "menu",
    name: routeKey,
    sortOrder: id,
    icon: null,
    isVisible: true,
    routeKey,
    path: routeKey === "Members" ? "/members" : "/transactions",
    url: null,
    permissionCode: routeKey === "Members" ? "members:read" : "transactions:read",
    isExternal: false,
    keepAlive: true,
    children: [],
  } as AuthorizedMenuNode;
}

function createDescriptor(
  search: string,
  cacheParams: Readonly<Record<string, unknown>> = {},
): RegisteredPageDescriptor {
  return {
    routeKey: "Transactions",
    cacheParams,
    render: ({ session }) => <DescriptorProbe search={search} session={session} />,
  };
}

describe("AuthenticatedLayout", () => {
  it("活动页面仅更新 search 时使用新的 descriptor 闭包并保留页面节点", async () => {
    const user = userEvent.setup();
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    const transactionsMenu = registeredMenu("Transactions", 3);
    mock.onGet("http://localhost:4000/menus").reply(200, {
      code: "OK",
      message: "ok",
      data: [transactionsMenu],
    });
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
    const transactionsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/transactions",
      staticData: { routeKey: "Transactions" },
      validateSearch: (search: Record<string, unknown>) => ({
        page: typeof search.page === "number" ? search.page : 1,
      }),
      beforeLoad: ({ search }) => ({
        registeredMenu: transactionsMenu,
        registeredPage: createDescriptor(`page=${search.page}`),
      }),
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([transactionsRoute]),
      history: createMemoryHistory({ initialEntries: ["/transactions?page=1"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    const originalNode = await screen.findByTestId("cached-probe");
    await user.type(screen.getByRole("textbox", { name: "descriptor input" }), "retained state");

    await act(async () => router.navigate({ to: "/transactions", search: { page: 2 } } as never));

    expect(screen.getByTestId("cached-probe")).toBe(originalNode);
    expect(screen.getByRole("textbox", { name: "descriptor input" })).toHaveValue("retained state");
    expect(screen.getByTestId("descriptor-search")).toHaveTextContent("page=2");
  });

  it("隐藏后以新 search 返回时使用新的 descriptor 闭包并保留页面节点", async () => {
    const user = userEvent.setup();
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    const transactionsMenu = registeredMenu("Transactions", 3);
    mock.onGet("http://localhost:4000/menus").reply(200, {
      code: "OK",
      message: "ok",
      data: [transactionsMenu],
    });
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
    const transactionsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/transactions",
      staticData: { routeKey: "Transactions" },
      validateSearch: (search: Record<string, unknown>) => ({
        page: typeof search.page === "number" ? search.page : 1,
      }),
      beforeLoad: ({ search }) => ({
        registeredMenu: transactionsMenu,
        registeredPage: createDescriptor(`page=${search.page}`),
      }),
      component: () => null,
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([transactionsRoute, membersRoute]),
      history: createMemoryHistory({ initialEntries: ["/transactions?page=1"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    const originalNode = await screen.findByTestId("cached-probe");
    await user.type(screen.getByRole("textbox", { name: "descriptor input" }), "retained state");

    await act(async () => router.navigate({ to: "/members" } as never));
    await act(async () => router.navigate({ to: "/transactions", search: { page: 2 } } as never));

    expect(screen.getByTestId("cached-probe")).toBe(originalNode);
    expect(screen.getByRole("textbox", { name: "descriptor input" })).toHaveValue("retained state");
    expect(screen.getByTestId("descriptor-search")).toHaveTextContent("page=2");
  });

  it("使用 descriptor cacheParams 而非叶路由 params 决定缓存 identity", async () => {
    const user = userEvent.setup();
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    const membersMenu = registeredMenu("Members", 2);
    mock.onGet("http://localhost:4000/menus").reply(200, {
      code: "OK",
      message: "ok",
      data: [membersMenu],
    });
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
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members/$memberId",
      staticData: { routeKey: "Members" },
      beforeLoad: ({ params }) => ({
        registeredMenu: membersMenu,
        registeredPage: {
          routeKey: "Members",
          cacheParams: { view: "members" },
          render: ({ session: descriptorSession }: { session: WebSessionDependency }) => (
            <DescriptorProbe search={`member=${params.memberId}`} session={descriptorSession} />
          ),
        },
      }),
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([membersRoute]),
      history: createMemoryHistory({ initialEntries: ["/members/1"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    const originalNode = await screen.findByTestId("cached-probe");
    await user.type(screen.getByRole("textbox", { name: "descriptor input" }), "retained state");

    await act(async () => router.navigate({ to: "/members/2" } as never));

    expect(screen.getByTestId("cached-probe")).toBe(originalNode);
    expect(screen.getByRole("textbox", { name: "descriptor input" })).toHaveValue("retained state");
    expect(screen.getByTestId("descriptor-search")).toHaveTextContent("member=2");
  });

  it("忽略错键叶路由 descriptor 并回退 Outlet", async () => {
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    const membersMenu = registeredMenu("Members", 2);
    mock.onGet("http://localhost:4000/menus").reply(200, {
      code: "OK",
      message: "ok",
      data: [membersMenu],
    });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    await session.menuStore
      .getState()
      .loadMenusForOrganization("org-1", session.iamApi.getAuthorizedMenus);
    const descriptorRender = vi.fn(() => <p>descriptor page</p>);
    const wrongDescriptor: RegisteredPageDescriptor = {
      routeKey: "Transactions",
      cacheParams: {},
      render: descriptorRender,
    };
    const rootRoute = createRootRoute({
      component: () => <AuthenticatedLayout session={session} />,
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      staticData: { routeKey: "Members" },
      beforeLoad: () => ({ registeredPage: wrongDescriptor }),
      component: () => <p data-testid="outlet-probe">outlet page</p>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([membersRoute]),
      history: createMemoryHistory({ initialEntries: ["/members"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(await screen.findByTestId("outlet-probe")).toBeInTheDocument();
    expect(descriptorRender).not.toHaveBeenCalled();
  });

  it("呈现当前会话的组织、邮箱与获授权导航控制项", async () => {
    const user = userEvent.setup();
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
    const membersLink = screen.getByRole("link", { name: "成员" });
    expect(membersLink).toHaveAttribute("href", "/members");
    const accessControlGroup = screen.getByText("访问控制").closest('[data-sidebar="group"]');
    expect(accessControlGroup).not.toBeNull();
    const accessControl = within(accessControlGroup as HTMLElement);
    const securityTrigger = accessControl.getByRole("button", { name: /安全/ });
    expect(
      securityTrigger.compareDocumentPosition(membersLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(securityTrigger).toHaveAttribute("aria-expanded", "false");
    expect(accessControl.queryByRole("link", { name: "会话" })).not.toBeInTheDocument();

    await user.click(securityTrigger);

    expect(securityTrigger).toHaveAttribute("aria-expanded", "true");
    expect(accessControl.getByRole("link", { name: "会话" })).toHaveAttribute("href", "/sessions");

    await user.click(securityTrigger);

    expect(accessControl.queryByRole("link", { name: "会话" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "产品文档" })).toHaveAttribute(
      "href",
      "https://docs.example.com",
    );
    expect(screen.getByRole("link", { name: "产品文档" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "产品文档" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.queryByRole("link", { name: "角色" })).not.toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="trigger"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换主题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "搜索命令" })).toBeInTheDocument();
    expect(mock.history.get.filter(({ url }) => url?.endsWith("/menus"))).toHaveLength(1);
  });

  it("按活动路由键高亮对应的动态菜单", async () => {
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet("http://localhost:4000/menus").reply(200, {
      code: "OK",
      message: "ok",
      data: authorizedMenus,
    });
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
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      staticData: { routeKey: "Members" },
      component: () => <main>成员内容</main>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([membersRoute]),
      history: createMemoryHistory({ initialEntries: ["/members"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("link", { name: "成员" })).toHaveAttribute(
      "data-active",
      "true",
    );
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
