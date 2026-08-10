import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  auditLogs,
  menus,
  menuType,
  organizationMemberships,
  organizations,
  permissions,
  refreshSessions,
  rolePermissions,
  roles,
  users,
} from "./schema.js";

describe("RBAC database schema", () => {
  it("exports all RBAC tables", () => {
    expect(users).toBeDefined();
    expect(organizations).toBeDefined();
    expect(organizationMemberships).toBeDefined();
    expect(roles).toBeDefined();
    expect(permissions).toBeDefined();
    expect(rolePermissions).toBeDefined();
    expect(refreshSessions).toBeDefined();
    expect(auditLogs).toBeDefined();
  });
});

describe("organization menu database schema", () => {
  it("uses identity menu ids and organization-scoped numeric parents", () => {
    expect(menus.id.dataType).toMatch(/^number/);
    expect(menus.id.generatedIdentity?.type).toBe("always");
    expect(menus.organizationId.notNull).toBe(true);
    expect(menus.parentId.dataType).toMatch(/^number/);
  });

  it("exports the menu type enum and complete menu fields", () => {
    expect(menuType.enumValues).toEqual(["directory", "menu", "button"]);
    expect(menus).toMatchObject({
      type: expect.anything(),
      routeKey: expect.anything(),
      path: expect.anything(),
      url: expect.anything(),
      permissionCode: expect.anything(),
      isExternal: expect.anything(),
      isVisible: expect.anything(),
      keepAlive: expect.anything(),
      icon: expect.anything(),
      name: expect.anything(),
      sortOrder: expect.anything(),
    });
    expect(menus).not.toHaveProperty("componentKey");
  });

  it("enforces menu type combinations and organization-local parentage", () => {
    const config = getTableConfig(menus);

    expect(config.checks.map((constraint) => constraint.name)).toEqual([
      "menus_directory_fields_check",
      "menus_internal_menu_fields_check",
      "menus_external_menu_fields_check",
      "menus_button_fields_check",
    ]);
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "menus_organization_route_key_unique",
        "menus_organization_path_unique",
      ]),
    );
    expect(config.uniqueConstraints.map((constraint) => constraint.getName())).toContain(
      "menus_organization_id_unique",
    );
    expect(config.foreignKeys.map((constraint) => constraint.getName())).toContain(
      "menus_organization_parent_fk",
    );
  });
});
