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

const bookkeepingWritePermissionKeys = [
  "transactions:create",
  "transactions:update",
  "transactions:delete",
  "accounts:create",
  "accounts:update",
  "accounts:delete",
  "categories:create",
  "categories:update",
  "categories:delete",
] as const satisfies readonly PermissionKey[];
const bookkeepingWritePermissions = new Set<PermissionKey>(bookkeepingWritePermissionKeys);
const rentalReadPermissionKeys = [
  "rental_properties:read",
  "rental_spaces:read",
  "rental_tenants:read",
  "rental_contracts:read",
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
    const expected = permissionKeys.filter((permission) => permission !== "roles:delete");

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
      ]);
      expect(role?.permissions).not.toEqual(expect.arrayContaining([...rentalWritePermissionKeys]));
    }
  });

  it("grants the confirmed bookkeeping and rental read permissions to member", () => {
    const member = buildRbacSeedPlan().roles.find((role) => role.key === "member");

    expect(member?.permissions.toSorted()).toEqual(
      [
        "dashboard:read",
        "ledgers:read",
        "accounts:read",
        "categories:read",
        "transactions:read",
        "transactions:create",
        "transactions:update",
        "statistics:read",
        "rental_properties:read",
        "rental_spaces:read",
        "rental_tenants:read",
        "rental_contracts:read",
      ].sort(),
    );
    expect(member?.permissions).toEqual(
      expect.arrayContaining(["transactions:create", "transactions:update"]),
    );
    expect(member?.permissions.some((permission) => permission.endsWith(":delete"))).toBe(false);
  });

  it("grants viewer only dashboard, bookkeeping, and rental read permissions", () => {
    const viewer = buildRbacSeedPlan().roles.find((role) => role.key === "viewer");

    expect(viewer?.permissions.toSorted()).toEqual(
      [
        "dashboard:read",
        "ledgers:read",
        "accounts:read",
        "categories:read",
        "transactions:read",
        "statistics:read",
        "rental_properties:read",
        "rental_spaces:read",
        "rental_tenants:read",
        "rental_contracts:read",
      ].sort(),
    );
    expect(
      viewer?.permissions.filter((permission) => bookkeepingWritePermissions.has(permission)),
    ).toEqual([]);
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

describe("seedRbac bookkeeping orchestration", () => {
  it("passes the transaction executor and resolved bootstrap context to defaults", async () => {
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
    expect(harness.defaultsCalls).toEqual([
      {
        executor: harness.transactionExecutor,
        context: { organizationId: "organization-1", actorUserId: "user-1" },
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

  it("does not initialize defaults or menus when bootstrap data is absent", async () => {
    const harness = createSeedHarness(undefined);

    await seedRbac(harness.db, {} as ServerEnv, harness.dependencies);

    expect(harness.defaultsCalls).toEqual([]);
    expect(harness.menuCalls).toEqual([]);
  });

  it("reinitializes idempotent defaults but keeps menus unchanged for an existing organization", async () => {
    const harness = createSeedHarness({
      organization: { id: "organization-1", created: false },
      actorUserId: "user-1",
    });

    await seedRbac(harness.db, {} as ServerEnv, harness.dependencies);

    expect(harness.defaultsCalls).toHaveLength(1);
    expect(harness.menuCalls).toEqual([]);
  });
});

type FakeTransactionExecutor = { readonly kind: "transaction" };

function createSeedHarness(bootstrap: BootstrapSeedResult | undefined) {
  const transactionExecutor: FakeTransactionExecutor = { kind: "transaction" };
  let insideTransaction = false;
  const defaultsCalls: Array<{
    executor: FakeTransactionExecutor;
    context: { organizationId: string; actorUserId: string };
    insideTransaction: boolean;
  }> = [];
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
    async initializeDefaults(executor, context) {
      defaultsCalls.push({ executor, context, insideTransaction });
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
    defaultsCalls,
    menuCalls,
  };
}
