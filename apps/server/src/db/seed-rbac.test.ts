import { permissionKeys, systemRoleKeys } from "@xpense/shared";
import { describe, expect, it } from "vitest";

import { buildRbacSeedPlan, shouldInitializeMenuTemplate } from "./seed-rbac.js";

describe("buildRbacSeedPlan", () => {
  it("includes every shared permission", () => {
    const plan = buildRbacSeedPlan();

    expect(plan.permissions.map((permission) => permission.key).sort()).toEqual(
      [...permissionKeys].sort(),
    );
  });

  it("grants every permission to owner", () => {
    const plan = buildRbacSeedPlan();
    const owner = plan.roles.find((role) => role.key === "owner");

    expect(owner?.permissions.toSorted()).toEqual([...permissionKeys].sort());
  });

  it("grants dashboard access to every default role", () => {
    const plan = buildRbacSeedPlan();

    expect(plan.roles.every((role) => role.permissions.includes("dashboard:read"))).toBe(true);
  });

  it("grants menu management permissions to owner and admin", () => {
    const plan = buildRbacSeedPlan();
    const menuPermissions = ["menus:read", "menus:create", "menus:update", "menus:delete"];

    for (const roleKey of ["owner", "admin"] as const) {
      const role = plan.roles.find((candidate) => candidate.key === roleKey);

      expect(role?.permissions).toEqual(expect.arrayContaining(menuPermissions));
    }
  });

  it("defines the confirmed system roles in order", () => {
    const plan = buildRbacSeedPlan();

    expect(plan.roles.map((role) => role.key)).toEqual([...systemRoleKeys]);
  });

  it("builds a stable deterministic seed plan", () => {
    expect(buildRbacSeedPlan()).toEqual(buildRbacSeedPlan());
  });

  it("initializes a menu template only for an organization created in this seed run", () => {
    expect(shouldInitializeMenuTemplate(true)).toBe(true);
    expect(shouldInitializeMenuTemplate(false)).toBe(false);
  });
});
