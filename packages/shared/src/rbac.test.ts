import { describe, expect, it } from "vitest";

import { permissionKeys, systemRoleKeys } from "./rbac.js";

describe("RBAC shared constants", () => {
  it("uses stable resource.action permission keys", () => {
    for (const key of permissionKeys) {
      expect(key).toMatch(/^[a-z_]+(:[a-z_]+)+$/);
    }
  });

  it("defines the initial system roles", () => {
    expect(systemRoleKeys).toEqual(["owner", "admin", "member", "viewer"]);
  });

  it("includes the dashboard and menu management permissions", () => {
    expect(permissionKeys).toEqual(
      expect.arrayContaining([
        "dashboard:read",
        "menus:read",
        "menus:create",
        "menus:update",
        "menus:delete",
      ]),
    );
  });

  it("includes the bookkeeping permission vocabulary", () => {
    expect(permissionKeys).toEqual(
      expect.arrayContaining([
        "ledgers:read",
        "accounts:read",
        "accounts:create",
        "accounts:update",
        "accounts:delete",
        "categories:read",
        "categories:create",
        "categories:update",
        "categories:delete",
        "transactions:read",
        "transactions:create",
        "transactions:update",
        "transactions:delete",
        "statistics:read",
      ]),
    );
  });

  it("grants rental writes to owner and admin while keeping member and viewer read-only", () => {
    const rentalReadPermissions = ["rental_properties:read", "rental_spaces:read"];
    const rentalWritePermissions = [
      "rental_properties:create",
      "rental_properties:update",
      "rental_properties:delete",
      "rental_spaces:create",
      "rental_spaces:update",
      "rental_spaces:delete",
    ];
    const rolePermissions = {
      owner: [...rentalReadPermissions, ...rentalWritePermissions],
      admin: [...rentalReadPermissions, ...rentalWritePermissions],
      member: rentalReadPermissions,
      viewer: rentalReadPermissions,
    };

    expect(permissionKeys).toEqual(
      expect.arrayContaining([...rentalReadPermissions, ...rentalWritePermissions]),
    );
    for (const roleKey of ["owner", "admin"] as const) {
      expect(rolePermissions[roleKey]).toEqual(
        expect.arrayContaining([...rentalReadPermissions, ...rentalWritePermissions]),
      );
    }
    for (const roleKey of ["member", "viewer"] as const) {
      expect(rolePermissions[roleKey]).toEqual(rentalReadPermissions);
    }
  });
});
