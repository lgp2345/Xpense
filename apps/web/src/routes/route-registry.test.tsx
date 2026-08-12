import { ROUTE_DEFINITIONS, type RouteKey } from "@xpense/shared";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { AuditLogSearch } from "../features/audit/audit-log-filters";
import { ROUTE_REGISTRY } from "./route-registry";

describe("ROUTE_REGISTRY", () => {
  it("registers every shared route key exactly once", () => {
    expect(Object.keys(ROUTE_REGISTRY).sort()).toEqual(Object.keys(ROUTE_DEFINITIONS).sort());
  });

  it.each(
    Object.keys(ROUTE_DEFINITIONS) as RouteKey[],
  )("keeps the exact shared path and routeKey metadata for %s", (routeKey) => {
    const registration = ROUTE_REGISTRY[routeKey];

    expect((registration.route.options as { path?: string }).path).toBe(
      ROUTE_DEFINITIONS[routeKey].path,
    );
    expect(registration.route.options.staticData).toEqual({ routeKey });
  });

  it("retains TanStack's typed params and validated audit-log search", () => {
    // biome-ignore lint/complexity/noBannedTypes: TanStack uses {} for a static route with no params.
    expectTypeOf<typeof ROUTE_REGISTRY.Members.route.types.allParams>().toEqualTypeOf<{}>();
    expectTypeOf<
      typeof ROUTE_REGISTRY.AuditLogs.route.types.fullSearchSchema
    >().toEqualTypeOf<AuditLogSearch>();

    const validateSearch = ROUTE_REGISTRY.AuditLogs.route.options.validateSearch;

    expect(typeof validateSearch).toBe("function");
    if (typeof validateSearch !== "function") {
      return;
    }

    expect(
      validateSearch({
        action: "role.created",
        actorUserId: "user-1",
        from: "2026-08-01",
        page: "2",
        targetType: "role",
        to: "2026-08-12",
      }),
    ).toEqual({
      action: "role.created",
      actorUserId: "user-1",
      from: "2026-08-01",
      page: 2,
      targetType: "role",
      to: "2026-08-12",
    });
  });
});
