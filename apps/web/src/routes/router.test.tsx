import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type AuthorizedMenuNode,
  type PermissionKey,
  ROUTE_DEFINITIONS,
  type RouteKey,
} from "@xpense/shared";
import axios, { type AxiosInstance } from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../components/app-providers";
import { rentalKeys } from "../services/rental-query";
import { createWebSession, type WebSessionDependency } from "../services/web-session";
import { createAuthStore } from "../stores/auth-store";
import { AppRouter, createAppRouter } from "./router";

const routePermissions = {
  Dashboard: "dashboard:read",
  Members: "members:read",
  Roles: "roles:read",
  Sessions: "sessions:read",
  AuditLogs: "audit_logs:read",
  Menus: "menus:read",
  Transactions: "transactions:read",
  Accounts: "accounts:read",
  Categories: "categories:read",
  RentalProperties: "rental_properties:read",
  RentalPropertyDetail: "rental_properties:read",
} as const satisfies Record<RouteKey, PermissionKey>;

function authorizedMenu<Key extends RouteKey>(routeKey: Key, id: number): AuthorizedMenuNode {
  return {
    id,
    parentId: null,
    type: "menu",
    name: routeKey,
    sortOrder: id,
    icon: null,
    isVisible: true,
    routeKey,
    path: ROUTE_DEFINITIONS[routeKey].path,
    url: null,
    permissionCode: routePermissions[routeKey],
    isExternal: false,
    keepAlive: false,
    children: [],
  } as AuthorizedMenuNode;
}

function createAuthenticatedStore(permissions: PermissionKey[] = [], isSuperAdmin = false) {
  return createAuthStore({
    accessToken: "access-token",
    currentUser: {
      id: "user-1",
      email: "owner@example.com",
      isSuperAdmin,
      status: "active",
    },
    currentOrganization: { id: "org-1", name: "个人账本" },
    role: { id: "role-1", key: "owner", name: "所有者" },
    permissions,
    session: { id: "session-1", clientType: "web_pc" },
    status: "authenticated",
  });
}

function createRouterSession(
  store: ReturnType<typeof createAuthStore>,
  instance: AxiosInstance,
): WebSessionDependency {
  return createWebSession({
    authStore: store,
    baseUrl: "http://localhost:4000",
    instance,
  });
}

function mockEnvelope<T>(data: T) {
  return { code: "OK", message: "ok", data };
}

async function createReadySession(
  menus: AuthorizedMenuNode[],
  store = createAuthenticatedStore(),
  configure?: (mock: MockAdapter) => void,
) {
  const instance = axios.create();
  const mock = new MockAdapter(instance);
  mock.onGet(/\/menus$/).reply(200, mockEnvelope(menus));
  configure?.(mock);
  mock.onAny().reply(500, {
    code: "INTERNAL_ERROR",
    message: "unexpected request",
    data: null,
  });
  const session = createRouterSession(store, instance);

  await session.menuStore
    .getState()
    .loadMenusForOrganization("org-1", session.iamApi.getAuthorizedMenus);

  return { instance, mock, session, store };
}

async function loadAuthorizedPath(
  path: string,
  routeKey: RouteKey,
  permissions: PermissionKey[] = [],
) {
  const harness = await createReadySession(
    [authorizedMenu(routeKey, 1)],
    createAuthenticatedStore(permissions),
  );
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    session: harness.session,
  });
  await router.load();

  return { ...harness, router };
}

function renderRouter(router: ReturnType<typeof createAppRouter>) {
  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

describe("router auth and menu guards", () => {
  it("removes rental cache data when an authenticated organization changes or logs out", async () => {
    const harness = await createReadySession([], createAuthenticatedStore());
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/foundation"] }),
      session: harness.session,
    });
    const queryClient = new QueryClient();
    const propertyKey = rentalKeys.properties("org-1", { page: 1, pageSize: 20 });

    render(
      <QueryClientProvider client={queryClient}>
        <AppRouter router={router} restoreSession={async () => true} />
      </QueryClientProvider>,
    );
    await screen.findByText("最小工程闭环");
    queryClient.setQueryData(propertyKey, []);

    harness.store.setState((state) => ({
      ...state,
      currentOrganization: { id: "org-2", name: "家庭账本" },
    }));
    await waitFor(() => expect(queryClient.getQueryState(propertyKey)).toBeUndefined());

    queryClient.setQueryData(rentalKeys.properties("org-2", { page: 1, pageSize: 20 }), []);
    harness.store.getState().clearAuth();
    await waitFor(() =>
      expect(
        queryClient.getQueryState(rentalKeys.properties("org-2", { page: 1, pageSize: 20 })),
      ).toBeUndefined(),
    );
  });

  it("redirects unauthenticated registered routes to login before rendering", async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onAny().reply(() => {
      throw new Error("Unexpected request");
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/members"] }),
      session: createRouterSession(createAuthStore(), instance),
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/members" });
  });

  it("protects the dashboard while keeping foundation public", async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onAny().reply(() => {
      throw new Error("Unexpected request");
    });
    const session = createRouterSession(createAuthStore(), instance);
    const dashboardRouter = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      session,
    });
    const foundationRouter = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/foundation"] }),
      session,
    });

    await dashboardRouter.load();
    await foundationRouter.load();

    expect(dashboardRouter.state.location.pathname).toBe("/login");
    expect(foundationRouter.state.location.pathname).toBe("/foundation");
  });

  it("renders a route authorized by the ready local menu index without a permission shortcut", async () => {
    const { router, mock } = await loadAuthorizedPath("/roles", "Roles");

    renderRouter(router);

    expect(await screen.findByRole("heading", { name: "角色管理" })).toBeInTheDocument();
    expect(screen.getByText("组织访问控制")).toBeInTheDocument();
    expect(mock.history.get.filter((request) => request.url?.includes("/menus/resolve"))).toEqual(
      [],
    );
  });

  it("allows a super admin to use a locally registered route without ordinary permissions", async () => {
    const harness = await createReadySession(
      [authorizedMenu("AuditLogs", 1)],
      createAuthenticatedStore([], true),
      (mock) => {
        mock.onGet(/\/audit-logs/).reply(200, mockEnvelope([]));
      },
    );
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/audit-logs"] }),
      session: harness.session,
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/audit-logs");
  });

  it("shows a waiting state while resolving a registered local miss and never flashes 404", async () => {
    let finishResolve: (() => void) | undefined;
    const resolvedMenu = authorizedMenu("Members", 2);
    const harness = await createReadySession([], createAuthenticatedStore(), (mock) => {
      mock.onGet(/\/menus\/resolve\?path=%2Fmembers$/).reply(
        () =>
          new Promise((resolve) => {
            finishResolve = () => resolve([200, mockEnvelope(resolvedMenu)]);
          }),
      );
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/members"] }),
      session: harness.session,
    });

    renderRouter(router);

    expect(await screen.findByText("正在验证页面访问权限...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "页面不存在" })).not.toBeInTheDocument();
    await waitFor(() => expect(finishResolve).toBeTypeOf("function"));

    await act(async () => finishResolve?.());

    expect(await screen.findByRole("heading", { name: "成员管理" })).toBeInTheDocument();
  });

  it("redirects to forbidden when the server resolves a registered local miss as 403", async () => {
    const harness = await createReadySession([], createAuthenticatedStore(), (mock) => {
      mock.onGet(/\/menus\/resolve\?path=%2Froles$/).reply(403, {
        code: "FORBIDDEN",
        message: "forbidden",
        data: null,
      });
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/roles"] }),
      session: harness.session,
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/forbidden");
    expect(
      harness.mock.history.get.filter((request) => request.url?.includes("/menus/resolve")),
    ).toHaveLength(1);
  });

  it("renders 404 when the server resolves a registered local miss as 404", async () => {
    const harness = await createReadySession([], createAuthenticatedStore(), (mock) => {
      mock.onGet(/\/menus\/resolve\?path=%2Fsessions$/).reply(404, {
        code: "NOT_FOUND",
        message: "not found",
        data: null,
      });
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/sessions"] }),
      session: harness.session,
    });

    await router.load();
    renderRouter(router);

    expect(await screen.findByRole("heading", { name: "页面不存在" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sessions");
  });

  it("uses TanStack matching for an unknown static path without calling resolve", async () => {
    const harness = await createReadySession([]);
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/unknown-static-path"] }),
      session: harness.session,
    });

    await router.load();
    renderRouter(router);

    expect(await screen.findByRole("heading", { name: "页面不存在" })).toBeInTheDocument();
    expect(
      harness.mock.history.get.filter((request) => request.url?.includes("/menus/resolve")),
    ).toEqual([]);
  });

  it("keeps the static menu recovery route available to a super admin when menus fail", async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/menus$/).reply(500, {
      code: "INTERNAL_ERROR",
      message: "menu unavailable",
      data: null,
    });
    const session = createRouterSession(createAuthenticatedStore([], true), instance);
    await vi.waitFor(() => expect(session.menuStore.getState().status).toBe("error"));
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/system/menu-reset"] }),
      session,
    });

    await router.load();
    renderRouter(router);

    expect(await screen.findByRole("heading", { name: "菜单恢复" })).toBeInTheDocument();
    expect(screen.queryByText("菜单加载失败，请稍后重试。")).not.toBeInTheDocument();
  });

  it("redirects an anonymous menu recovery request to login with its return path", async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onAny().reply(() => {
      throw new Error("Unexpected request");
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/system/menu-reset"] }),
      session: createRouterSession(createAuthStore(), instance),
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/system/menu-reset" });
  });

  it("rejects an ordinary authenticated user from the static menu recovery route", async () => {
    const harness = await createReadySession([authorizedMenu("Dashboard", 1)]);
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/system/menu-reset"] }),
      session: harness.session,
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/forbidden");
  });
});

describe("registered page adapters", () => {
  it("renders the sessions page and clears auth after revoking the current session", async () => {
    const user = userEvent.setup();
    const store = createAuthenticatedStore(["sessions:read", "sessions:revoke"]);
    const harness = await createReadySession([authorizedMenu("Sessions", 1)], store, (mock) => {
      mock
        .onGet(/\/auth\/sessions$/)
        .reply(
          200,
          mockEnvelope([
            { id: "session-1", clientType: "web_pc", status: "active", lastUsedAt: null },
          ]),
        );
      mock.onPost(/\/auth\/sessions\/session-1\/revoke$/).reply(200, mockEnvelope(null));
      mock.onPost(/\/auth\/logout$/).reply(200, mockEnvelope(null));
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/sessions"] }),
      session: harness.session,
    });
    await router.load();
    renderRouter(router);

    await user.click(await screen.findByRole("button", { name: "撤销 session-1" }));
    await user.click(screen.getByRole("button", { name: "确认撤销" }));

    await waitFor(() => expect(store.getState().status).toBe("anonymous"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("renders audit-log filters from typed search and drops calendar-invalid dates", async () => {
    const user = userEvent.setup();
    const harness = await createReadySession(
      [authorizedMenu("AuditLogs", 1)],
      createAuthenticatedStore(["audit_logs:read"]),
      (mock) => {
        mock.onGet(/\/audit-logs/).reply(200, mockEnvelope([]));
      },
    );
    const router = createAppRouter({
      history: createMemoryHistory({
        initialEntries: [
          "/audit-logs?action=role.created&targetType=role&from=2026-99-99&to=2026-02-30",
        ],
      }),
      session: harness.session,
    });
    await router.load();
    const navigate = vi.spyOn(router, "navigate");
    renderRouter(router);

    expect(await screen.findByRole("textbox", { name: "操作" }, { timeout: 3_000 })).toHaveValue(
      "role.created",
    );
    expect(screen.getByRole("textbox", { name: "目标类型" })).toHaveValue("role");
    await waitFor(() =>
      expect(harness.mock.history.get.some((request) => request.url?.includes("/audit-logs"))).toBe(
        true,
      ),
    );
    const auditRequest = harness.mock.history.get.find((request) =>
      request.url?.includes("/audit-logs"),
    );
    expect(auditRequest?.url).not.toMatch(/[?&](from|to)=/);

    await user.clear(screen.getByRole("textbox", { name: "操作" }));
    await user.type(screen.getByRole("textbox", { name: "操作" }), "member.disabled");

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        action: "member.disabled",
        targetType: "role",
      }),
    );
    const filterNavigation = navigate.mock.calls
      .map(([options]) => options)
      .find((options) => JSON.stringify(options.search).includes("member.disabled"));

    expect(filterNavigation).toMatchObject({
      from: ROUTE_DEFINITIONS.AuditLogs.path,
      replace: true,
      search: expect.objectContaining({
        action: "member.disabled",
        targetType: "role",
      }),
    });
    expect(filterNavigation).not.toHaveProperty("to");
  });
});
