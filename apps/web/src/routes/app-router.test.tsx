import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode, CurrentUserResponse } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../components/app-providers";
import { createWebSession } from "../services/web-session";
import { authStore, createAuthStore } from "../stores/auth-store";
import { AppRouter, createAppRouter } from "./router";

const authorizedMenus: AuthorizedMenuNode[] = [
  {
    id: 1,
    parentId: null,
    type: "menu",
    name: "仪表盘",
    sortOrder: 0,
    icon: "LayoutDashboard",
    isVisible: true,
    routeKey: "Dashboard",
    path: "/",
    url: null,
    permissionCode: "dashboard:read",
    isExternal: false,
    keepAlive: false,
    children: [],
  },
  {
    id: 2,
    parentId: null,
    type: "menu",
    name: "成员管理",
    sortOrder: 1,
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
  {
    id: 3,
    parentId: null,
    type: "menu",
    name: "交易记录",
    sortOrder: 2,
    icon: "ReceiptText",
    isVisible: true,
    routeKey: "Transactions",
    path: "/transactions",
    url: null,
    permissionCode: "transactions:read",
    isExternal: false,
    keepAlive: true,
    children: [],
  },
  {
    id: 4,
    parentId: null,
    type: "menu",
    name: "房产管理",
    sortOrder: 3,
    icon: "Building2",
    isVisible: true,
    routeKey: "RentalProperties",
    path: "/rentals/properties",
    url: null,
    permissionCode: "rental_properties:read",
    isExternal: false,
    keepAlive: true,
    children: [],
  },
];

const injectedUserContext: CurrentUserResponse = {
  user: {
    id: "injected-user",
    email: "injected@example.com",
    isSuperAdmin: false,
    status: "active",
  },
  organization: { id: "org-injected", name: "注入账本" },
  role: { id: "role-injected", key: "owner", name: "所有者" },
  permissions: [],
  session: { id: "session-injected", clientType: "web_pc" },
};

const globalUserContext: CurrentUserResponse = {
  ...injectedUserContext,
  user: { ...injectedUserContext.user, id: "global-user", email: "global@example.com" },
  organization: { id: "org-global", name: "全局账本" },
};

/** 创建绑定指定认证 store 的隔离 Web 会话。 */
function createTestSession(store: ReturnType<typeof createAuthStore>) {
  const instance = axios.create();
  const mock = new MockAdapter(instance);
  mock.onGet(/\/menus$/).reply(200, { code: "OK", message: "ok", data: authorizedMenus });
  mock.onGet(/\/rental-properties\/list/).reply(200, {
    code: "OK",
    message: "ok",
    data: { items: [], total: 0, page: 1, pageSize: 20 },
  });
  mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });

  return createWebSession({
    authStore: store,
    baseUrl: "http://localhost:4000",
    instance,
  });
}

describe("AppRouter startup", () => {
  it("renders the registered rental property route through the injected session", async () => {
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext({
      ...injectedUserContext,
      permissions: ["rental_properties:read"],
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/rentals/properties"] }),
      session: createTestSession(store),
    });
    render(
      <AppProviders>
        <AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />
      </AppProviders>,
    );
    expect(await screen.findByRole("heading", { name: "房产管理" })).toBeInTheDocument();
    expect(await screen.findByText("当前没有房产。")).toBeInTheDocument();
  });

  it("renders a registered bookkeeping route through the injected session", async () => {
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext({
      ...injectedUserContext,
      permissions: ["transactions:read"],
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/transactions"] }),
      session: createTestSession(store),
    });

    render(
      <AppProviders>
        <AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />
      </AppProviders>,
    );

    expect(
      await screen.findByRole("heading", { name: "交易记录" }, { timeout: 3_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("记账页面正在建设中")).not.toBeInTheDocument();
  });

  it("waits for cookie session restoration before rendering protected content", async () => {
    const store = createAuthStore();
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      session: createTestSession(store),
    });
    let finishRestore: (() => void) | undefined;
    const restoreSession = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishRestore = () => {
            store.getState().setAccessToken("access-token");
            store.getState().setCurrentUserContext({
              user: {
                id: "user-1",
                email: "owner@example.com",
                isSuperAdmin: false,
                status: "active",
              },
              organization: { id: "org-1", name: "个人账本" },
              role: { id: "role-1", key: "owner", name: "所有者" },
              permissions: [],
              session: { id: "session-1", clientType: "web_pc" },
            });
            resolve(true);
          };
        }),
    );

    render(
      <AppProviders>
        <AppRouter restoreSession={restoreSession} router={router} />
      </AppProviders>,
    );

    expect(screen.getByText("正在恢复会话...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "仪表盘" })).not.toBeInTheDocument();

    await act(async () => finishRestore?.());

    expect(await screen.findByRole("heading", { name: "仪表盘" })).toBeInTheDocument();
  });

  it("restores the cookie session only once in React StrictMode", () => {
    const restoreSession = vi.fn(() => new Promise<boolean>(() => undefined));
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      session: createTestSession(createAuthStore()),
    });

    render(
      <AppProviders>
        <StrictMode>
          <AppRouter restoreSession={restoreSession} router={router} />
        </StrictMode>
      </AppProviders>,
    );

    expect(restoreSession).toHaveBeenCalledTimes(1);
  });

  it("invalidates an already-rendered protected route when authentication is cleared", async () => {
    const store = createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "owner", name: "所有者" },
      permissions: ["members:read"],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/members"] }),
      session: createTestSession(store),
    });

    render(
      <AppProviders>
        <AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />
      </AppProviders>,
    );
    expect(await screen.findByRole("heading", { name: "成员管理" })).toBeInTheDocument();

    act(() => store.getState().clearAuth());

    expect(await screen.findByRole("heading", { name: "登录到你的账本" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ redirect: "/members" });
  });

  it("clears bookkeeping cache after restoration, login, organization switch, and logout", async () => {
    const store = createAuthStore();
    const session = createTestSession(store);
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      session,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["bookkeeping", "org-stale", "transactions"], ["stale"]);
    queryClient.setQueryData(["iam", "menus"], ["keep"]);

    const restoreSession = vi.fn(async () => {
      store.getState().setAccessToken("restored-token");
      store.getState().setCurrentUserContext(injectedUserContext);
      return true;
    });

    render(
      <AppProviders queryClient={queryClient}>
        <AppRouter restoreSession={restoreSession} router={router} />
      </AppProviders>,
    );

    await screen.findByRole("heading", { name: "仪表盘" });
    expect(queryClient.getQueryData(["bookkeeping", "org-stale", "transactions"])).toBeUndefined();
    expect(queryClient.getQueryData(["iam", "menus"])).toEqual(["keep"]);

    queryClient.setQueryData(["bookkeeping", "org-injected", "accounts"], ["old account"]);
    act(() => {
      store.getState().setCurrentUserContext({
        ...injectedUserContext,
        organization: { id: "org-family", name: "家庭账本" },
      });
    });
    await waitFor(() =>
      expect(queryClient.getQueryData(["bookkeeping", "org-injected", "accounts"])).toBeUndefined(),
    );

    queryClient.setQueryData(["bookkeeping", "org-family", "monthly"], ["private"]);
    act(() => store.getState().clearAuth());
    await waitFor(() =>
      expect(queryClient.getQueryData(["bookkeeping", "org-family", "monthly"])).toBeUndefined(),
    );

    queryClient.setQueryData(["bookkeeping", "org-anonymous-stale", "categories"], ["private"]);
    act(() => store.getState().setCurrentUserContext(injectedUserContext));
    await waitFor(() =>
      expect(
        queryClient.getQueryData(["bookkeeping", "org-anonymous-stale", "categories"]),
      ).toBeUndefined(),
    );
  });

  it("uses one injected session for the dashboard header, organizations, logout, and guard", async () => {
    const user = userEvent.setup();
    const store = createAuthStore({ accessToken: "injected-access" });
    store.getState().setCurrentUserContext(injectedUserContext);
    authStore.getState().setAccessToken("global-access");
    authStore.getState().setCurrentUserContext(globalUserContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/menus$/).reply(200, { code: "OK", message: "ok", data: authorizedMenus });
    mock.onGet(/\/user\/organizations$/).reply(200, {
      code: "OK",
      message: "ok",
      data: [
        { id: "org-injected", name: "注入账本", status: "active" },
        { id: "org-family", name: "家庭账本", status: "active" },
      ],
    });
    mock.onPost(/\/auth\/logout$/).reply(200, { code: "OK", message: "ok", data: null });
    mock.onAny().reply(500, { code: "INTERNAL_ERROR", message: "unexpected request", data: null });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const router = createAppRouter({
      session,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    try {
      render(
        <AppProviders>
          <AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />
        </AppProviders>,
      );

      expect((await screen.findAllByText("injected@example.com")).length).toBeGreaterThan(0);
      expect(mock.history.get.some((config) => config.url?.endsWith("/menus"))).toBe(true);
      expect(screen.queryByText("global@example.com")).not.toBeInTheDocument();
      await vi.waitFor(() =>
        expect(mock.history.get.some((config) => config.url?.endsWith("/user/organizations"))).toBe(
          true,
        ),
      );

      await user.click(screen.getByRole("button", { name: /injected@example.com/ }));
      await user.click(screen.getByRole("menuitem", { name: "退出登录" }));

      expect(await screen.findByRole("heading", { name: "登录到你的账本" })).toBeInTheDocument();
      expect(store.getState()).toMatchObject({ accessToken: null, status: "anonymous" });
      expect(authStore.getState()).toMatchObject({
        accessToken: "global-access",
        currentUser: globalUserContext.user,
        status: "authenticated",
      });
      expect(
        mock.history.post.map((config) => ({
          url: config.url,
          authorization:
            typeof config.headers?.get === "function"
              ? config.headers.get("Authorization")
              : (config.headers as Record<string, unknown> | undefined)?.Authorization,
        })),
      ).toEqual([
        {
          url: "http://localhost:4000/auth/logout",
          authorization: "Bearer injected-access",
        },
      ]);
    } finally {
      authStore.getState().clearAuth();
    }
  });

  it("uses the active router session for default restoration", async () => {
    const store = createAuthStore();
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/menus$/).reply(200, { code: "OK", message: "ok", data: authorizedMenus });
    mock.onPost(/\/auth\/refresh$/).reply(200, {
      code: "OK",
      message: "ok",
      data: { accessToken: "restored-injected-access" },
    });
    mock.onGet(/\/user$/).reply(200, { code: "OK", message: "ok", data: injectedUserContext });
    mock.onGet(/\/user\/organizations$/).reply(200, {
      code: "OK",
      message: "ok",
      data: [{ id: "org-injected", name: "注入账本", status: "active" }],
    });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const router = createAppRouter({
      session,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(
      <AppProviders>
        <AppRouter router={router} />
      </AppProviders>,
    );

    expect((await screen.findAllByText("injected@example.com")).length).toBeGreaterThan(0);
    expect(store.getState()).toMatchObject({
      accessToken: "restored-injected-access",
      currentUser: injectedUserContext.user,
      status: "authenticated",
    });
    expect(mock.history.post.some((config) => config.url?.endsWith("/auth/refresh"))).toBe(true);
    expect(mock.history.get.some((config) => config.url?.endsWith("/menus"))).toBe(true);
  });

  it("rechecks the active registered route after a failed menu bootstrap is retried", async () => {
    const user = userEvent.setup();
    const store = createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "owner", name: "所有者" },
      permissions: ["members:read"],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/menus$/).replyOnce(500, {
      code: "INTERNAL_ERROR",
      message: "menu unavailable",
      data: null,
    });
    mock.onGet(/\/menus$/).reply(200, { code: "OK", message: "ok", data: [] });
    mock.onGet(/\/menus\/resolve\?path=%2Fmembers$/).reply(403, {
      code: "FORBIDDEN",
      message: "forbidden",
      data: null,
    });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/members"] }),
      session,
    });

    render(
      <AppProviders>
        <AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("菜单加载失败，请稍后重试。");

    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByRole("heading", { name: "无权限访问" })).toBeInTheDocument();
    expect(
      mock.history.get.filter((request) => request.url?.includes("/menus/resolve")),
    ).toHaveLength(1);
  });

  it("keeps an unknown static URL on 404 throughout a same-organization menu refresh", async () => {
    const store = createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "owner", name: "所有者" },
      permissions: [],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    let finishRefresh: (() => void) | undefined;
    mock.onGet(/\/menus$/).replyOnce(200, { code: "OK", message: "ok", data: authorizedMenus });
    mock.onGet(/\/menus$/).reply(
      () =>
        new Promise((resolve) => {
          finishRefresh = () =>
            resolve([200, { code: "OK", message: "ok", data: authorizedMenus }]);
        }),
    );
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    await session.menuStore
      .getState()
      .loadMenusForOrganization("org-1", session.iamApi.getAuthorizedMenus);
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/unknown-static-path"] }),
      session,
    });

    render(
      <AppProviders>
        <AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "页面不存在" })).toBeInTheDocument();
    let sawPermissionPending = false;
    let sawNotFoundRemoval = false;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        sawPermissionPending ||= [...record.addedNodes].some((node) =>
          node.textContent?.includes("正在验证页面访问权限..."),
        );
        sawNotFoundRemoval ||= [...record.removedNodes].some((node) =>
          node.textContent?.includes("页面不存在"),
        );
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = session.menuStore
        .getState()
        .loadMenusForOrganization("org-1", session.iamApi.getAuthorizedMenus);
    });
    await waitFor(() => expect(finishRefresh).toBeTypeOf("function"));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(screen.getByRole("heading", { name: "页面不存在" })).toBeInTheDocument();
    expect(screen.queryByText("正在验证页面访问权限...")).not.toBeInTheDocument();

    await act(async () => {
      finishRefresh?.();
      await refreshPromise;
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    observer.disconnect();

    expect(screen.getByRole("heading", { name: "页面不存在" })).toBeInTheDocument();
    expect(sawPermissionPending).toBe(false);
    expect(sawNotFoundRemoval).toBe(false);
    expect(
      mock.history.get.filter((request) => request.url?.includes("/menus/resolve")),
    ).toHaveLength(0);
  });

  it("restores a still-locally-authorized route after menu refresh without resolve", async () => {
    const store = createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "owner", name: "所有者" },
      permissions: ["members:read"],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    let finishRefresh: (() => void) | undefined;
    mock.onGet(/\/menus$/).replyOnce(200, { code: "OK", message: "ok", data: authorizedMenus });
    mock.onGet(/\/menus$/).reply(
      () =>
        new Promise((resolve) => {
          finishRefresh = () =>
            resolve([200, { code: "OK", message: "ok", data: authorizedMenus }]);
        }),
    );
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/members"] }),
      session,
    });

    render(
      <AppProviders>
        <AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "成员管理" })).toBeInTheDocument();

    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = session.menuStore
        .getState()
        .loadMenusForOrganization("org-1", session.iamApi.getAuthorizedMenus);
    });
    expect(await screen.findByText("正在加载组织菜单...")).toBeInTheDocument();
    await waitFor(() => expect(finishRefresh).toBeTypeOf("function"));

    await act(async () => {
      finishRefresh?.();
      await refreshPromise;
    });

    expect(await screen.findByRole("heading", { name: "成员管理" })).toBeInTheDocument();
    expect(
      mock.history.get.filter((request) => request.url?.includes("/menus/resolve")),
    ).toHaveLength(0);
  });

  it.each([
    { status: 403, heading: "无权限访问" },
    { status: 404, heading: "页面不存在" },
  ])("rechecks the active route after a ready menu refresh resolves $status", async ({
    status,
    heading,
  }) => {
    const store = createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "owner", name: "所有者" },
      permissions: ["members:read"],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    let finishRefresh: (() => void) | undefined;
    let finishResolve: (() => void) | undefined;
    mock.onGet(/\/menus$/).replyOnce(200, { code: "OK", message: "ok", data: authorizedMenus });
    mock.onGet(/\/menus$/).reply(
      () =>
        new Promise((resolve) => {
          finishRefresh = () => resolve([200, { code: "OK", message: "ok", data: [] }]);
        }),
    );
    mock.onGet(/\/menus\/resolve\?path=%2Fmembers$/).reply(
      () =>
        new Promise((resolve) => {
          finishResolve = () =>
            resolve([
              status,
              {
                code: status === 403 ? "FORBIDDEN" : "NOT_FOUND",
                message: status === 403 ? "forbidden" : "not found",
                data: null,
              },
            ]);
        }),
    );
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/members"] }),
      session,
    });

    render(
      <AppProviders>
        <AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "成员管理" })).toBeInTheDocument();

    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = session.menuStore
        .getState()
        .loadMenusForOrganization("org-1", session.iamApi.getAuthorizedMenus);
    });

    expect(await screen.findByText("正在加载组织菜单...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "成员管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "页面不存在" })).not.toBeInTheDocument();
    await waitFor(() => expect(finishRefresh).toBeTypeOf("function"));

    await act(async () => {
      finishRefresh?.();
      await refreshPromise;
    });

    expect(mock.history.get.filter((request) => request.url?.endsWith("/menus"))).toHaveLength(2);
    expect(session.menuStore.getState().status).toBe("ready");
    await waitFor(() => expect(finishResolve).toBeTypeOf("function"));
    expect(screen.getByText("正在验证页面访问权限...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "成员管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "页面不存在" })).not.toBeInTheDocument();

    await act(async () => finishResolve?.());

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "成员管理" })).not.toBeInTheDocument();
    expect(
      mock.history.get.filter((request) => request.url?.includes("/menus/resolve")),
    ).toHaveLength(1);
  });
});
