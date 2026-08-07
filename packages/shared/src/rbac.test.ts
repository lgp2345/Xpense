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
});
