import { describe, expect, it } from "vitest";

import { createPermissionChecker } from "./use-permission";

describe("createPermissionChecker", () => {
  it("checks single and grouped permissions", () => {
    const checker = createPermissionChecker({
      isSuperAdmin: false,
      permissions: ["roles.read", "roles.update"],
    });

    expect(checker.can("roles.read")).toBe(true);
    expect(checker.can("roles.delete")).toBe(false);
    expect(checker.canAny(["roles.delete", "roles.update"])).toBe(true);
    expect(checker.canAll(["roles.read", "roles.update"])).toBe(true);
    expect(checker.canAll(["roles.read", "roles.delete"])).toBe(false);
  });

  it("treats super admin as allowed in the current organization UI", () => {
    const checker = createPermissionChecker({ isSuperAdmin: true, permissions: [] });

    expect(checker.can("roles.delete")).toBe(true);
    expect(checker.canAny(["roles.delete"])).toBe(true);
    expect(checker.canAll(["roles.delete", "members.update"])).toBe(true);
  });
});
