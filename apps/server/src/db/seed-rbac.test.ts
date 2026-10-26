import { type PermissionKey, permissionKeys, systemRoleKeys } from "@xpense/shared";
import { describe, expect, it } from "vitest";

import type { ServerEnv } from "../config/env.schema.js";
import {
  type BootstrapSeedResult,
  buildRbacSeedPlan,
  type SeedRbacWorkflowDependencies,
  seedRbac,
  shouldInitializeMenuTemplate,
} from "./seed-rbac.js";

const rentalReadPermissionKeys = [
  "rental_properties:read",
  "rental_spaces:read",
  "rental_tenants:read",
  "rental_contracts:read",
  "rental_bills:read",
] as const satisfies readonly PermissionKey[];
const rentalWritePermissionKeys = [
  "rental_properties:create",
  "rental_properties:update",
  "rental_properties:delete",
  "rental_spaces:create",
  "rental_spaces:update",
  "rental_spaces:delete",
  "rental_tenants:create",
  "rental_tenants:update",
  "rental_tenants:delete",
  "rental_tenants:sensitive_read",
  "rental_contracts:create",
  "rental_contracts:update",
  "rental_contracts:delete",
] as const satisfies readonly PermissionKey[];

describe("buildRbacSeedPlan", () => {
  it("keeps bill actions restricted to owner/admin and grants read to default read roles", () => {
    for (const role of buildRbacSeedPlan().roles) {
      expect(role.permissions).toContain("rental_bills:read");
      expect(role.permissions.includes("rental_bills:generate")).toBe(
        role.key === "owner" || role.key === "admin",
      );
      expect(role.permissions.includes("rental_bills:adjust")).toBe(
        role.key === "owner" || role.key === "admin",
      );
    }
  });
  it("grants organization settings only to the default owner role", () => {
    for (const role of buildRbacSeedPlan().roles) {
      expect(role.permissions.includes("organization_settings:read" as PermissionKey)).toBe(
        role.key === "owner",
      );
      expect(role.permissions.includes("organization_settings:update" as PermissionKey)).toBe(
        role.key === "owner",
      );
    }
  });
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

  it("grants admin every permission except deleting roles", () => {
    const admin = buildRbacSeedPlan().roles.find((role) => role.key === "admin");
    const expected = permissionKeys.filter(
      (permission) =>
        permission !== "roles:delete" && !permission.startsWith("organization_settings:"),
    );

    expect(admin?.permissions.toSorted()).toEqual(expected.toSorted());
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

  it("grants rental writes to owner and admin while keeping member and viewer read-only", () => {
    const plan = buildRbacSeedPlan();

    for (const roleKey of ["owner", "admin"] as const) {
      const role = plan.roles.find((candidate) => candidate.key === roleKey);

      expect(role?.permissions).toEqual(
        expect.arrayContaining([...rentalReadPermissionKeys, ...rentalWritePermissionKeys]),
      );
    }
    for (const roleKey of ["member", "viewer"] as const) {
      const role = plan.roles.find((candidate) => candidate.key === roleKey);

      expect(role?.permissions).toEqual(expect.arrayContaining([...rentalReadPermissionKeys]));
      expect(role?.permissions).not.toEqual(expect.arrayContaining([...rentalWritePermissionKeys]));
    }
  });

  it("grants member and viewer every rental read permission and no privileged rental action", () => {
    const plan = buildRbacSeedPlan();

    for (const roleKey of ["member", "viewer"] as const) {
      const role = plan.roles.find((candidate) => candidate.key === roleKey);

      expect(role?.permissions.filter((permission) => permission.startsWith("rental_"))).toEqual([
        "rental_properties:read",
        "rental_spaces:read",
        "rental_tenants:read",
        "rental_contracts:read",
        "rental_bills:read",
      ]);
      expect(role?.permissions).not.toContain("rental_settlements:read");
      expect(role?.permissions).not.toContain("rental_settlements:confirm");
      expect(role?.permissions).not.toEqual(expect.arrayContaining([...rentalWritePermissionKeys]));
    }
  });

  it("grants member only dashboard and rental read permissions", () => {
    const member = buildRbacSeedPlan().roles.find((role) => role.key === "member");

    expect(member?.permissions.toSorted()).toEqual(
      ["dashboard:read", ...rentalReadPermissionKeys].sort(),
    );
  });

  it("grants viewer only dashboard and rental read permissions", () => {
    const viewer = buildRbacSeedPlan().roles.find((role) => role.key === "viewer");

    expect(viewer?.permissions.toSorted()).toEqual(
      ["dashboard:read", ...rentalReadPermissionKeys].sort(),
    );
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

describe("seedRbac organization orchestration", () => {
  it("initializes only the menu template for a newly created organization", async () => {
    const bootstrap: BootstrapSeedResult = {
      organization: { id: "organization-1", created: true },
      actorUserId: "user-1",
    };
    const harness = createSeedHarness(bootstrap);

    await seedRbac(harness.db, {} as ServerEnv, harness.dependencies);

    expect(harness.workflowCalls).toEqual([
      {
        step: "prepare-rbac",
        executor: harness.transactionExecutor,
        insideTransaction: true,
      },
      {
        step: "resolve-bootstrap",
        executor: harness.transactionExecutor,
        insideTransaction: true,
      },
    ]);
    expect(harness.menuCalls).toEqual([
      {
        executor: harness.transactionExecutor,
        organizationId: "organization-1",
        insideTransaction: true,
      },
    ]);
  });

  it("does not initialize menus when bootstrap data is absent", async () => {
    const harness = createSeedHarness(undefined);

    await seedRbac(harness.db, {} as ServerEnv, harness.dependencies);

    expect(harness.menuCalls).toEqual([]);
  });

  it("does not create defaults or change menus for an existing organization", async () => {
    const harness = createSeedHarness({
      organization: { id: "organization-1", created: false },
      actorUserId: "user-1",
    });

    await seedRbac(harness.db, {} as ServerEnv, harness.dependencies);

    expect(harness.menuCalls).toEqual([]);
  });
});

type FakeTransactionExecutor = { readonly kind: "transaction" };

function createSeedHarness(bootstrap: BootstrapSeedResult | undefined) {
  const transactionExecutor: FakeTransactionExecutor = { kind: "transaction" };
  let insideTransaction = false;
  const menuCalls: Array<{
    executor: FakeTransactionExecutor;
    organizationId: string;
    insideTransaction: boolean;
  }> = [];
  const workflowCalls: Array<{
    step: "prepare-rbac" | "resolve-bootstrap";
    executor: FakeTransactionExecutor;
    insideTransaction: boolean;
  }> = [];
  const dependencies: SeedRbacWorkflowDependencies<FakeTransactionExecutor> = {
    async prepareRbac(executor) {
      workflowCalls.push({ step: "prepare-rbac", executor, insideTransaction });
      return new Map([
        ["owner", "owner-role-id"],
        ["admin", "admin-role-id"],
        ["member", "member-role-id"],
        ["viewer", "viewer-role-id"],
      ]);
    },
    async resolveBootstrap(executor) {
      workflowCalls.push({ step: "resolve-bootstrap", executor, insideTransaction });
      return bootstrap;
    },
    async initializeMenu(executor, organizationId) {
      menuCalls.push({ executor, organizationId, insideTransaction });
    },
  };
  const db = {
    async transaction(callback: (executor: FakeTransactionExecutor) => Promise<void>) {
      insideTransaction = true;
      try {
        await callback(transactionExecutor);
      } finally {
        insideTransaction = false;
      }
    },
  };

  return {
    db,
    dependencies,
    transactionExecutor,
    workflowCalls,
    menuCalls,
  };
}
