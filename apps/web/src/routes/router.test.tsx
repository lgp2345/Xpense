import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey } from "@xpense/shared";
import axios, { type AxiosInstance } from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../components/app-providers";
import { createWebSession } from "../services/web-session";
import { createAuthStore } from "../stores/auth-store";
import { createAppRouter, protectedRoutePermissions } from "./router";

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

function createSuperAdminStore() {
  return createAuthenticatedStore([], true);
}

function createRouterSession(
  store: ReturnType<typeof createAuthStore>,
  instance: AxiosInstance = createRejectingInstance(),
) {
  return createWebSession({
    authStore: store,
    baseUrl: "http://localhost:4000",
    instance,
  });
}

function createRejectingInstance(): AxiosInstance {
  const instance = axios.create();
  const mock = new MockAdapter(instance);
  mock.onAny().reply(() => {
    throw new Error("Unexpected request");
  });

  return instance;
}

async function loadPath(path: string, permissions?: PermissionKey[]) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const store = permissions ? createAuthenticatedStore(permissions) : createAuthStore();
  const router = createAppRouter({
    history,
    session: createRouterSession(store),
  });
  await router.load();

  return router;
}

describe("router auth guards", () => {
  it("redirects unauthenticated protected routes to login before rendering", async () => {
    const router = await loadPath("/members");

    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/members" });
  });

  it("protects the dashboard while keeping foundation public", async () => {
    const dashboardRouter = await loadPath("/");
    const foundationRouter = await loadPath("/foundation");

    expect(dashboardRouter.state.location.pathname).toBe("/login");
    expect(foundationRouter.state.location.pathname).toBe("/foundation");
  });

  it("redirects authenticated users without the required permission to forbidden", async () => {
    const router = await loadPath("/roles", ["members:read"]);

    expect(router.state.location.pathname).toBe("/forbidden");
  });

  it("allows a super admin without the route permission", async () => {
    const history = createMemoryHistory({ initialEntries: ["/audit-logs"] });
    const router = createAppRouter({
      history,
      session: createRouterSession(createSuperAdminStore()),
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/audit-logs");
  });

  it("renders the roles management page instead of the administration placeholder", async () => {
    const router = await loadPath("/roles", ["roles:read"]);

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "角色管理" })).toBeInTheDocument();
    expect(screen.getByText("组织访问控制")).toBeInTheDocument();
    expect(screen.queryByText("此页面将在后续管理任务中完成。")).not.toBeInTheDocument();
  });

  it("renders the sessions management page instead of the administration placeholder", async () => {
    const router = await loadPath("/sessions", ["sessions:read"]);

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "会话管理" })).toBeInTheDocument();
    expect(screen.getByText("账号安全")).toBeInTheDocument();
    expect(screen.queryByText("此页面将在后续管理任务中完成。")).not.toBeInTheDocument();
  });

  it("renders the audit log page and restores typed URL filters", async () => {
    const user = userEvent.setup();
    const history = createMemoryHistory({
      initialEntries: ["/audit-logs?action=role.created&targetType=role"],
    });
    const store = createAuthenticatedStore(["audit_logs:read"]);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const router = createAppRouter({
      history,
      session: createRouterSession(store, instance),
    });
    await router.load();

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "审计日志" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "操作" })).toHaveValue("role.created");
    expect(screen.getByRole("textbox", { name: "目标类型" })).toHaveValue("role");
    expect(screen.queryByText("此页面将在后续管理任务中完成。")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "操作" }));
    await user.type(screen.getByRole("textbox", { name: "操作" }), "member.disabled");

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        action: "member.disabled",
        targetType: "role",
      }),
    );
  });

  it("ignores calendar-invalid audit log date filters without breaking the page", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/audit-logs?from=2026-99-99&to=2026-02-30"],
    });
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const router = createAppRouter({
      history,
      session: createRouterSession(createAuthenticatedStore(["audit_logs:read"]), instance),
    });
    await router.load();

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "审计日志" })).toBeInTheDocument();
    await waitFor(() =>
      expect(mock.history.get.some((config) => config.url?.includes("/audit-logs"))).toBe(true),
    );
    const auditLogRequest = mock.history.get.find((config) => config.url?.includes("/audit-logs"));
    expect(auditLogRequest?.url).not.toMatch(/[?&](from|to)=/);
  });

  it("clears authentication and navigates to login after revoking the current session", async () => {
    const user = userEvent.setup();
    const history = createMemoryHistory({ initialEntries: ["/sessions"] });
    const store = createAuthenticatedStore(["sessions:read", "sessions:revoke"]);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/auth\/sessions$/).reply(200, {
      code: "OK",
      message: "ok",
      data: [{ id: "session-1", clientType: "web_pc", status: "active", lastUsedAt: null }],
    });
    mock.onPost(/\/auth\/sessions\/session-1\/revoke$/).reply(200, {
      code: "OK",
      message: "ok",
      data: null,
    });
    mock.onPost(/\/auth\/logout$/).reply(200, { code: "OK", message: "ok", data: null });
    mock.onAny().reply(500, { code: "INTERNAL_ERROR", message: "unexpected request", data: null });
    const router = createAppRouter({
      history,
      session: createRouterSession(store, instance),
    });
    await router.load();

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    await user.click(await screen.findByRole("button", { name: "撤销 session-1" }));
    await user.click(screen.getByRole("button", { name: "确认撤销" }));

    await waitFor(() => expect(store.getState().status).toBe("anonymous"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it.each([
    ["/members", "members:read"],
    ["/roles", "roles:read"],
    ["/sessions", "sessions:read"],
    ["/audit-logs", "audit_logs:read"],
  ] as const)("allows %s only with %s", async (path, permission) => {
    const router = await loadPath(path, [permission]);

    expect(router.state.location.pathname).toBe(path);
  });

  it("keeps the exact permission mapping for future administration pages", () => {
    expect(protectedRoutePermissions).toEqual({
      "/members": "members:read",
      "/roles": "roles:read",
      "/sessions": "sessions:read",
      "/audit-logs": "audit_logs:read",
    });
  });
});
