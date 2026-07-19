import { createMemoryHistory } from "@tanstack/react-router";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it } from "vitest";

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

async function loadPath(path: string, permissions?: PermissionKey[]) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter({
    authStore: permissions ? createAuthenticatedStore(permissions) : createAuthStore(),
    history,
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
    const router = createAppRouter({ authStore: createSuperAdminStore(), history });

    await router.load();

    expect(router.state.location.pathname).toBe("/audit-logs");
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
