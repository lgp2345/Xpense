import { permissionKeys, systemRoleKeys } from "@xpense/shared";
import { describe, expect, it } from "vitest";

import { buildRbacSeedPlan } from "./seed-rbac.js";

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

  it("defines the confirmed system roles in order", () => {
    const plan = buildRbacSeedPlan();

    expect(plan.roles.map((role) => role.key)).toEqual([...systemRoleKeys]);
  });

  it("builds a stable deterministic seed plan", () => {
    expect(buildRbacSeedPlan()).toEqual(buildRbacSeedPlan());
  });
});
