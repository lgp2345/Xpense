import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  type AuthorizedMenuNode,
  type PermissionKey,
  ROUTE_DEFINITIONS,
  type RouteKey,
} from "@xpense/shared";
import axios, { type AxiosInstance } from "axios";
import MockAdapter from "axios-mock-adapter";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "./components/app-providers";
import { AppRouter, createAppRouter } from "./router";
import { createWebSession, type WebSessionDependency } from "./services/web-session";
import { createAuthStore } from "./stores/auth-store";
import { createMenuStore } from "./stores/menu-store";

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
  RentalTenants: "rental_tenants:read",
  RentalTenantDetail: "rental_tenants:read",
  RentalContracts: "rental_contracts:read",
  RentalContractDetail: "rental_contracts:read",
  RentalContractCreate: "rental_contracts:read",
} as const satisfies Record<RouteKey, PermissionKey>;

function authorizedMenu<Key extends RouteKey>(
  routeKey: Key,
  id: number,
  keepAlive = false,
): AuthorizedMenuNode {
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
    keepAlive,
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

function createRouterSession(store: ReturnType<typeof createAuthStore>, instance: AxiosInstance) {
  return createWebSession({ authStore: store, baseUrl: "http://localhost:4000", instance });
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
  mock.onAny().reply(500, { code: "INTERNAL_ERROR", message: "unexpected request", data: null });
  const session = createRouterSession(store, instance);
  await session.menuStore
    .getState()
    .loadMenusForOrganization("org-1", session.iamApi.getAuthorizedMenus);
  return { instance, mock, session, store };
}

function renderRouter(router: ReturnType<typeof createAppRouter>, queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </QueryClientProvider>,
  );
}

function createSession(): WebSessionDependency {
  return {
    authApi: {} as WebSessionDependency["authApi"],
    authStore: createAuthStore(),
    bookkeepingApi: {} as WebSessionDependency["bookkeepingApi"],
    iamApi: {} as WebSessionDependency["iamApi"],
    menuStore: createMenuStore(),
    rentalApi: {} as WebSessionDependency["rentalApi"],
    restoreSession: vi.fn().mockResolvedValue(false),
  };
}

describe("file router foundation", () => {
  it("constructs with an injected memory history and session", () => {
    const session = createSession();
    const history = createMemoryHistory({ initialEntries: ["/"] });

    const router = createAppRouter({ history, session });

    expect(router.history).toBe(history);
  });

  it("builds canonical no-trailing-slash URLs for rental index routes", () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      session: createSession(),
    });

    expect(router.options.trailingSlash).toBe("never");
    expect(
      ["/rentals/properties", "/rentals/tenants", "/rentals/contracts"].map(
        (to) => router.buildLocation({ to }).href,
      ),
    ).toEqual(["/rentals/properties", "/rentals/tenants", "/rentals/contracts"]);
  });

  it("does not rewrite a directly entered trailing slash, while generated links stay canonical", async () => {
    const harness = await createReadySession(
      [authorizedMenu("RentalProperties", 1)],
      createAuthenticatedStore(["rental_properties:read"]),
    );
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/rentals/properties/"] }),
      session: harness.session,
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/rentals/properties/");
    expect(router.buildLocation({ to: "/rentals/properties" }).pathname).toBe(
      "/rentals/properties",
    );
  });

  it("restores the injected session once before mounting RouterProvider", async () => {
    const session = createSession();
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      session,
    });

    render(
      <AppProviders>
        <AppRouter router={router} />
      </AppProviders>,
    );

    expect(screen.getByText("正在恢复会话...")).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByText("正在恢复会话...")).not.toBeInTheDocument());
    expect(session.restoreSession).toHaveBeenCalledOnce();
  });
});

describe("generated router integration gate", () => {
  it("uses an injected rental API through the generated route tree", async () => {
    const listProperties = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    const rental = await createReadySession(
      [authorizedMenu("RentalProperties", 1)],
      createAuthenticatedStore(["rental_properties:read"]),
      (mock) => {
        mock
          .onGet(/\/rental-properties\/list/)
          .reply(200, mockEnvelope({ items: [], total: 0, page: 1, pageSize: 20 }));
      },
    );
    rental.session.rentalApi.listProperties = listProperties;
    const rentalRouter = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/rentals/properties"] }),
      session: rental.session,
    });
    await rentalRouter.load();
    const rentalView = renderRouter(rentalRouter);
    await waitFor(() => expect(listProperties).toHaveBeenCalled());
    await act(async () => rentalView.unmount());
  });

  it("uses an injected bookkeeping API through the generated route tree", async () => {
    const listTransactions = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    const bookkeeping = await createReadySession(
      [authorizedMenu("Transactions", 2)],
      createAuthenticatedStore(["transactions:read"]),
      (mock) => {
        mock
          .onGet(/\/transactions\/list/)
          .reply(200, mockEnvelope({ items: [], total: 0, page: 1, pageSize: 20 }));
      },
    );
    bookkeeping.session.bookkeepingApi.listTransactions = listTransactions;
    bookkeeping.session.bookkeepingApi.listPersonalLedgers = vi.fn().mockResolvedValue([]);
    bookkeeping.session.bookkeepingApi.listAccounts = vi.fn().mockResolvedValue([]);
    bookkeeping.session.bookkeepingApi.listCategories = vi.fn().mockResolvedValue([]);
    const bookkeepingRouter = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/transactions"] }),
      session: bookkeeping.session,
    });
    await bookkeepingRouter.load();
    await import("@/features/bookkeeping/transactions/transactions-page");
    const bookkeepingView = renderRouter(bookkeepingRouter);
    expect(await screen.findByRole("heading", { name: "交易记录" })).toBeInTheDocument();
    expect(listTransactions).toHaveBeenCalled();
    await act(async () => bookkeepingView.unmount());
  });

  it("keeps the restore gate and mounts after a failed restore", async () => {
    const session = createSession();
    session.restoreSession = vi.fn().mockRejectedValue(new Error("restore failed"));
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/foundation"] }),
      session,
    });

    render(
      <AppProviders>
        <AppRouter router={router} />
      </AppProviders>,
    );
    expect(screen.getByText("正在恢复会话...")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("正在恢复会话...")).not.toBeInTheDocument());
    expect(await screen.findByText("最小工程闭环")).toBeInTheDocument();
    expect(session.restoreSession).toHaveBeenCalledOnce();
  });

  it("restores once across a real StrictMode remount with a deferred promise", async () => {
    let resolveRestore!: (value: boolean) => void;
    const restore = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRestore = resolve;
        }),
    );
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/foundation"] }),
      session: createSession(),
    });

    render(
      <StrictMode>
        <AppProviders>
          <AppRouter router={router} restoreSession={restore} />
        </AppProviders>
      </StrictMode>,
    );
    expect(restore).toHaveBeenCalledOnce();
    expect(screen.getByText("正在恢复会话...")).toBeInTheDocument();
    await act(async () => resolveRestore(true));
    expect(await screen.findByText("最小工程闭环")).toBeInTheDocument();
    expect(restore).toHaveBeenCalledOnce();
  });

  it("revalidates the contract-create guard when create permission is removed", async () => {
    const harness = await createReadySession(
      [authorizedMenu("RentalContracts", 1)],
      createAuthenticatedStore([
        "rental_contracts:read",
        "rental_contracts:create",
        "rental_contracts:update",
      ]),
      (mock) => {
        mock
          .onGet(/\/menus\/resolve\?path=%2Frentals%2Fcontracts%2Fnew$/)
          .reply(200, mockEnvelope(authorizedMenu("RentalContractCreate", 2)));
      },
    );
    harness.session.iamApi.resolveMenuRoute = vi
      .fn()
      .mockResolvedValue(authorizedMenu("RentalContractCreate", 2));
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/rentals/contracts/new"] }),
      session: harness.session,
    });
    await router.load();
    const view = render(
      <AppProviders>
        <AppRouter router={router} restoreSession={async () => true} />
      </AppProviders>,
    );
    expect(
      await screen.findByRole("heading", { name: "选择房产与空间" }, { timeout: 3_000 }),
    ).toBeInTheDocument();

    act(() =>
      harness.store.setState((state) => ({
        ...state,
        permissions: ["rental_contracts:read"],
      })),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/forbidden"));
    expect(await screen.findByRole("heading", { name: "无权限访问" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "选择房产与空间" })).not.toBeInTheDocument();
    await act(async () => view.unmount());
  });

  it("clears protected access after auth clear", async () => {
    const harness = await createReadySession(
      [authorizedMenu("Roles", 1)],
      createAuthenticatedStore(["roles:read"]),
    );
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/roles"] }),
      session: harness.session,
    });
    render(
      <AppProviders>
        <AppRouter router={router} restoreSession={async () => true} />
      </AppProviders>,
    );
    expect(await screen.findByRole("heading", { name: "角色管理" })).toBeInTheDocument();
    act(() => harness.store.getState().clearAuth());
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("automatically invalidates the super-admin menu-reset boundary", async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/menus$/).reply(500, {
      code: "INTERNAL_ERROR",
      message: "menu unavailable",
      data: null,
    });
    mock.onAny().reply(500, { code: "INTERNAL_ERROR", message: "unexpected request", data: null });
    const store = createAuthenticatedStore([], true);
    const session = createRouterSession(store, instance);
    await waitFor(() => expect(session.menuStore.getState().status).toBe("error"));
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/system/menu-reset"] }),
      session,
    });
    render(
      <AppProviders>
        <AppRouter router={router} restoreSession={async () => true} />
      </AppProviders>,
    );
    expect(await screen.findByRole("heading", { name: "菜单恢复" })).toBeInTheDocument();

    act(() =>
      store.setState((state) => ({
        ...state,
        currentUser: state.currentUser ? { ...state.currentUser, isSuperAdmin: false } : null,
      })),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/forbidden"));
    expect(await screen.findByRole("heading", { name: "无权限访问" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "菜单恢复" })).not.toBeInTheDocument();
  });

  it("automatically invalidates the organization scope and loads the new organization menu", async () => {
    const harness = await createReadySession(
      [authorizedMenu("Roles", 1)],
      createAuthenticatedStore(["roles:read"]),
    );
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/roles"] }),
      session: harness.session,
    });
    render(
      <AppProviders>
        <AppRouter router={router} restoreSession={async () => true} />
      </AppProviders>,
    );
    expect(await screen.findByRole("heading", { name: "角色管理" })).toBeInTheDocument();

    let finishMenus!: () => void;
    const nextMenu = new Promise<AuthorizedMenuNode[]>((resolve) => {
      finishMenus = () => resolve([authorizedMenu("Roles", 2)]);
    });
    const loadMenus = vi.fn(async () => nextMenu);
    harness.session.iamApi.getAuthorizedMenus = loadMenus;
    const loadForOrganization = vi.spyOn(
      harness.session.menuStore.getState(),
      "loadMenusForOrganization",
    );
    act(() => {
      harness.store.setState((state) => ({
        ...state,
        currentOrganization: { id: "org-2", name: "家庭账本" },
      }));
    });
    await waitFor(() => expect(loadMenus).toHaveBeenCalledOnce());
    expect(loadForOrganization).toHaveBeenCalledWith("org-2", expect.any(Function));
    expect(await screen.findByText("正在验证页面访问权限...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "页面不存在" })).not.toBeInTheDocument();
    await act(async () => finishMenus());
    expect(await screen.findByRole("heading", { name: "角色管理" })).toBeInTheDocument();
    expect(screen.getByText("家庭账本")).toBeInTheDocument();
  });

  it.each([
    "ready",
    "error",
  ] as const)("holds the pending UI during %s-to-loading menu refresh without flashing old content or 404", async (initialStatus) => {
    const harness = await createReadySession(
      [authorizedMenu("Roles", 1)],
      createAuthenticatedStore(["roles:read"]),
    );
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/roles"] }),
      session: harness.session,
    });
    render(
      <AppProviders>
        <AppRouter router={router} restoreSession={async () => true} />
      </AppProviders>,
    );
    expect(await screen.findByRole("heading", { name: "角色管理" })).toBeInTheDocument();

    if (initialStatus === "error") {
      act(() => {
        harness.session.menuStore.setState((state) => ({ ...state, status: "error" }));
      });
    }
    let finishMenus!: () => void;
    const loading = new Promise<AuthorizedMenuNode[]>((resolve) => {
      finishMenus = () => resolve([authorizedMenu("Roles", 2)]);
    });
    const loadMenus = vi.fn(async () => loading);
    harness.session.iamApi.getAuthorizedMenus = loadMenus;
    const refreshPromise = harness.session.menuStore
      .getState()
      .loadMenusForOrganization("org-1", harness.session.iamApi.getAuthorizedMenus);
    await waitFor(() => expect(loadMenus).toHaveBeenCalledOnce());
    expect(await screen.findByText("正在验证页面访问权限...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "角色管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "页面不存在" })).not.toBeInTheDocument();
    await act(async () => finishMenus());
    await refreshPromise;
    expect(await screen.findByRole("heading", { name: "角色管理" })).toBeInTheDocument();
  });

  it("renders an unknown static URL as not-found without menu resolution", async () => {
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

  it("preserves public, forbidden, and menu-reset shell boundaries", async () => {
    const anonymous = await createReadySession([], createAuthStore());
    const loginRouter = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/members"] }),
      session: anonymous.session,
    });
    await loginRouter.load();
    expect(loginRouter.state.location.pathname).toBe("/login");
    expect(loginRouter.state.location.search).toEqual({ redirect: "/members" });

    const publicRouter = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/foundation"] }),
      session: anonymous.session,
    });
    await publicRouter.load();
    const publicView = renderRouter(publicRouter);
    expect(await screen.findByText("最小工程闭环")).toBeInTheDocument();
    await act(async () => publicView.unmount());

    const ordinary = await createReadySession([authorizedMenu("Dashboard", 1)]);
    const forbiddenRouter = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/system/menu-reset"] }),
      session: ordinary.session,
    });
    await forbiddenRouter.load();
    expect(forbiddenRouter.state.location.pathname).toBe("/forbidden");
    const forbiddenView = renderRouter(forbiddenRouter);
    expect(await screen.findByRole("heading", { name: "无权限访问" })).toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="sidebar"]')).toBeNull();
    await act(async () => forbiddenView.unmount());

    const admin = await createReadySession([], createAuthenticatedStore([], true));
    const resetRouter = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/system/menu-reset"] }),
      session: admin.session,
    });
    await resetRouter.load();
    const resetView = renderRouter(resetRouter);
    expect(await screen.findByRole("heading", { name: "菜单恢复" })).toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="sidebar"]')).not.toBeNull();
    expect(
      admin.mock.history.get.filter((request) => request.url?.includes("/menus/resolve")),
    ).toEqual([]);
    await act(async () => resetView.unmount());
  });

  it("keeps a keepAlive page instance while search changes refresh its data", async () => {
    const listTransactions = vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    const harness = await createReadySession(
      [authorizedMenu("Transactions", 1, true), authorizedMenu("Roles", 2)],
      createAuthenticatedStore(["transactions:read", "roles:read"]),
    );
    harness.session.bookkeepingApi.listTransactions = listTransactions;
    harness.session.bookkeepingApi.listLedgers = vi.fn().mockResolvedValue([]);
    harness.session.iamApi.listRoles = vi.fn().mockResolvedValue([]);
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/transactions"] }),
      session: harness.session,
    });
    render(
      <AppProviders>
        <AppRouter router={router} restoreSession={async () => true} />
      </AppProviders>,
    );
    expect(
      await screen.findByRole("heading", { name: "交易记录" }, { timeout: 3_000 }),
    ).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "关键词" });
    fireEvent.change(input, { target: { value: "draft" } });
    expect(input).toHaveValue("draft");
    await router.navigate({
      to: "/roles",
      params: { propertyId: "", tenantId: "", contractId: "" },
    });
    expect(await screen.findByRole("heading", { name: "角色管理" })).toBeInTheDocument();
    await router.navigate({ to: "/transactions", search: { keyword: "房租" } });
    expect(await screen.findByRole("heading", { name: "交易记录" })).toBeInTheDocument();
    const restoredInput = screen.getByRole("textbox", { name: "关键词" });
    expect(restoredInput).toBe(input);
    expect(restoredInput).toHaveValue("房租");
    expect(listTransactions).toHaveBeenCalledWith(expect.objectContaining({ keyword: "房租" }));
  });
});
