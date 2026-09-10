import { type AuthorizedMenuNode, ROUTE_DEFINITIONS, type RouteKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/api-client";
import type { WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";
import { createMenuStore } from "@/stores/menu-store";

import type { AppRouterContext } from "../__root";
import { requireAuthenticatedRouteAccess, requireRegisteredRouteAccess } from "./access";

function authorizedMenu(routeKey: RouteKey, id = 1): AuthorizedMenuNode {
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
    permissionCode: null,
    isExternal: false,
    keepAlive: false,
    children: [],
  } as unknown as AuthorizedMenuNode;
}

function contextWithSession(
  options: {
    status?: "anonymous" | "authenticated";
    menus?: AuthorizedMenuNode[];
    resolveMenuRoute?: WebSessionDependency["iamApi"]["resolveMenuRoute"];
    getAuthorizedMenus?: WebSessionDependency["iamApi"]["getAuthorizedMenus"];
  } = {},
): Pick<AppRouterContext, "session"> {
  const authStore = createAuthStore({
    status: options.status ?? "authenticated",
    currentOrganization:
      (options.status ?? "authenticated") === "authenticated"
        ? { id: "org-1", name: "组织" }
        : null,
  });
  const menuStore = createMenuStore();
  const menus = options.menus ?? [];

  if (options.menus) {
    menuStore.setState({
      organizationId: "org-1",
      status: "ready",
      tree: menus,
      byRouteKey: Object.fromEntries(
        menus.flatMap((menu) => (menu.routeKey ? [[menu.routeKey, menu]] : [])),
      ),
      error: null,
    });
  }

  const session = {
    authStore,
    menuStore,
    iamApi: {
      getAuthorizedMenus: options.getAuthorizedMenus ?? vi.fn().mockResolvedValue(menus),
      resolveMenuRoute: options.resolveMenuRoute ?? vi.fn(),
    },
  } as unknown as WebSessionDependency;

  return { session };
}

const location = { href: "/members?tab=active", pathname: "/members" };

describe("route access guards", () => {
  it("redirects an anonymous request to login with the original href", () => {
    const context = contextWithSession({ status: "anonymous" });

    expect(() => requireAuthenticatedRouteAccess(context, location)).toThrow();

    try {
      requireAuthenticatedRouteAccess(context, location);
    } catch (error) {
      expect(error).toMatchObject({
        options: { to: "/login", search: { redirect: "/members?tab=active" } },
      });
    }
  });

  it("returns the local menu without resolving the pathname", async () => {
    const resolveMenuRoute = vi.fn();
    const context = contextWithSession({
      menus: [authorizedMenu("Members")],
      resolveMenuRoute,
    });

    const result = await requireRegisteredRouteAccess(
      context,
      { href: "/members", pathname: "/members" },
      "Members",
    );

    expect(result.registeredMenu?.routeKey).toBe("Members");
    expect(resolveMenuRoute).not.toHaveBeenCalled();
  });

  it("rejects a resolved route whose RouteKey differs from the file route", async () => {
    const context = contextWithSession({
      menus: [],
      resolveMenuRoute: vi.fn().mockResolvedValue(authorizedMenu("Roles")),
    });

    await expect(
      requireRegisteredRouteAccess(context, { href: "/members", pathname: "/members" }, "Members"),
    ).rejects.toBeDefined();
  });

  it("loads the organization menu before checking the local route index", async () => {
    const getAuthorizedMenus = vi.fn().mockResolvedValue([authorizedMenu("Members")]);
    const context = contextWithSession({ getAuthorizedMenus });

    const result = await requireRegisteredRouteAccess(
      context,
      { href: "/members", pathname: "/members" },
      "Members",
    );

    expect(result.registeredMenu?.routeKey).toBe("Members");
    expect(getAuthorizedMenus).toHaveBeenCalledOnce();
  });

  it("maps a resolved 403 to forbidden", async () => {
    const context = contextWithSession({
      menus: [],
      resolveMenuRoute: vi.fn().mockRejectedValue(new ApiError(403, "FORBIDDEN", "forbidden")),
    });

    await expect(
      requireRegisteredRouteAccess(context, { href: "/members", pathname: "/members" }, "Members"),
    ).rejects.toMatchObject({ options: { to: "/forbidden" } });
  });

  it("maps a resolved 404 to not-found", async () => {
    const context = contextWithSession({
      menus: [],
      resolveMenuRoute: vi.fn().mockRejectedValue(new ApiError(404, "NOT_FOUND", "not found")),
    });

    await expect(
      requireRegisteredRouteAccess(context, { href: "/members", pathname: "/members" }, "Members"),
    ).rejects.toMatchObject({ isNotFound: true });
  });

  it("propagates unknown resolve errors", async () => {
    const error = new Error("network failed");
    const context = contextWithSession({
      menus: [],
      resolveMenuRoute: vi.fn().mockRejectedValue(error),
    });

    await expect(
      requireRegisteredRouteAccess(context, { href: "/members", pathname: "/members" }, "Members"),
    ).rejects.toBe(error);
  });
});
