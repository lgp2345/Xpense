import { createMemoryHistory } from "@tanstack/react-router";
import { ROUTE_DEFINITIONS, type RouteKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { createAppRouter } from "../../router";
import type { WebSessionDependency } from "../../services/web-session";
import { createAuthStore } from "../../stores/auth-store";
import { createMenuStore } from "../../stores/menu-store";

function createContractSession(): WebSessionDependency {
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

function canonicalizeRoutePath(path: string, routeId: string): string {
  return routeId.endsWith("/") && path !== "/" ? path.replace(/\/+$/, "") : path;
}

describe("generated route URL contract", () => {
  it("keeps the root path unchanged while canonicalizing non-root trailing slashes", () => {
    expect(canonicalizeRoutePath("/", "/_authenticated/(core)/")).toBe("/");
    expect(
      canonicalizeRoutePath("/rentals/properties/", "/_authenticated/(rental)/rentals/properties/"),
    ).toBe("/rentals/properties");
    expect(canonicalizeRoutePath("/rentals/contracts/$contractId/", "/$contractId")).toBe(
      "/rentals/contracts/$contractId/",
    );
  });

  it("assembles every shared route key exactly once at its declared path", () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      session: createContractSession(),
    });
    const routes = Object.values(router.routesById).filter(
      (route): route is typeof route & { options: { staticData: { routeKey: RouteKey } } } =>
        route.options.staticData?.routeKey !== undefined,
    );
    const keys = routes.map((route) => route.options.staticData.routeKey);
    const grouped = new Map<RouteKey | string, typeof routes>();

    for (const route of routes) {
      const key = route.options.staticData.routeKey;
      grouped.set(key, [...(grouped.get(key) ?? []), route]);
    }

    expect(routes).toHaveLength(Object.keys(ROUTE_DEFINITIONS).length);
    expect(keys.filter((key) => !Object.hasOwn(ROUTE_DEFINITIONS, key))).toEqual([]);

    for (const [routeKey, definition] of Object.entries(ROUTE_DEFINITIONS)) {
      const matches = grouped.get(routeKey) ?? [];

      expect(matches, `${routeKey} route count`).toHaveLength(1);
      const route = matches[0];
      expect(
        canonicalizeRoutePath(route?.fullPath ?? "", route?.id ?? ""),
        `${routeKey} full path`,
      ).toBe(definition.path);
    }
  });

  it("builds directory index URLs without a trailing slash", () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      session: createContractSession(),
    });

    for (const to of ["/rentals/properties", "/rentals/tenants", "/rentals/contracts"] as const) {
      expect(router.buildLocation({ to }).pathname).toBe(to);
    }
  });
});
