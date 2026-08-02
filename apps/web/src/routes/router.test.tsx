import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

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
  fetchImpl: typeof fetch = (() => Promise.reject(new Error("Unexpected request"))) as typeof fetch,
) {
  return createWebSession({
    authStore: store,
    baseUrl: "http://localhost:4000",
    fetchImpl,
  });
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
    const router = await loadPath("/roles", ["members.read"]);

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
    const router = await loadPath("/roles", ["roles.read"]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "角色管理" })).toBeInTheDocument();
    expect(screen.getByText("组织访问控制")).toBeInTheDocument();
    expect(screen.queryByText("此页面将在后续管理任务中完成。")).not.toBeInTheDocument();
  });

  it("renders the sessions management page instead of the administration placeholder", async () => {
    const router = await loadPath("/sessions", ["sessions.read"]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "会话管理" })).toBeInTheDocument();
    expect(screen.getByText("账号安全")).toBeInTheDocument();
    expect(screen.queryByText("此页面将在后续管理任务中完成。")).not.toBeInTheDocument();
  });

  it("clears authentication and navigates to login after revoking the current session", async () => {
    const user = userEvent.setup();
    const history = createMemoryHistory({ initialEntries: ["/sessions"] });
    const store = createAuthenticatedStore(["sessions.read", "sessions.revoke"]);
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();

      if (url === "http://localhost:4000/auth/sessions" && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { id: "session-1", clientType: "web_pc", status: "active", lastUsedAt: null },
            ]),
            { status: 200 },
          ),
        );
      }

      if (
        url === "http://localhost:4000/auth/sessions/session-1/revoke" &&
        init?.method === "POST"
      ) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const router = createAppRouter({
      history,
      session: createRouterSession(store, fetchMock as typeof fetch),
    });
    await router.load();

    render(<RouterProvider router={router} />);

    await user.click(await screen.findByRole("button", { name: "撤销 session-1" }));
    await user.click(screen.getByRole("button", { name: "确认撤销" }));

    await waitFor(() => expect(store.getState().status).toBe("anonymous"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it.each([
    ["/members", "members.read"],
    ["/roles", "roles.read"],
    ["/sessions", "sessions.read"],
    ["/audit-logs", "audit_logs.read"],
  ] as const)("allows %s only with %s", async (path, permission) => {
    const router = await loadPath(path, [permission]);

    expect(router.state.location.pathname).toBe(path);
  });

  it("keeps the exact permission mapping for future administration pages", () => {
    expect(protectedRoutePermissions).toEqual({
      "/members": "members.read",
      "/roles": "roles.read",
      "/sessions": "sessions.read",
      "/audit-logs": "audit_logs.read",
    });
  });
});
