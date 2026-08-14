import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
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
      permissionCode: expect.anything(),
      isExternal: expect.anything(),
      isVisible: expect.anything(),
      keepAlive: expect.anything(),
      icon: expect.anything(),
      name: expect.anything(),
      sortOrder: expect.anything(),
    });
    expect(menus).not.toHaveProperty("componentKey");
    expect(menus).not.toHaveProperty("url");
  });

  it("enforces menu type combinations and organization-local parentage", () => {
    const config = getTableConfig(menus);
    const dialect = new PgDialect();
    const checks = Object.fromEntries(
      config.checks.map((constraint) => [
        constraint.name,
        dialect.sqlToQuery(constraint.value).sql,
      ]),
    );

    expect(config.checks.map((constraint) => constraint.name)).toEqual([
      "menus_directory_fields_check",
      "menus_internal_menu_fields_check",
      "menus_external_menu_fields_check",
      "menus_button_fields_check",
    ]);
    const expectCheck = (name: string, included: string[], excluded: string[]) => {
      const expression = checks[name];

      expect(expression).toEqual(expect.any(String));
      for (const fragment of included) {
        expect(expression).toContain(fragment);
      }
      for (const fragment of excluded) {
        expect(expression).not.toContain(fragment);
      }
    };

    expectCheck(
      "menus_directory_fields_check",
      [
        '"menus"."type" <> \'directory\' OR (',
        '"menus"."route_key" IS NULL',
        '"menus"."path" IS NULL',
        '"menus"."permission_code" IS NULL',
        '"menus"."is_external" IS NULL',
        '"menus"."keep_alive" IS NULL',
        '"menus"."is_visible" IS NOT NULL',
      ],
      [
        '"menus"."route_key" IS NOT NULL',
        '"menus"."path" IS NOT NULL',
        '"menus"."permission_code" IS NOT NULL',
        '"menus"."is_external" IS TRUE',
        '"menus"."is_external" IS FALSE',
        '"menus"."keep_alive" IS NOT NULL',
        '"menus"."is_visible" IS NULL',
        '"menus"."url"',
      ],
    );
    expectCheck(
      "menus_internal_menu_fields_check",
      [
        '"menus"."type" <> \'menu\' OR "menus"."is_external" IS TRUE OR (',
        '"menus"."is_external" IS FALSE',
        '"menus"."route_key" IS NOT NULL',
        '"menus"."path" IS NULL',
        '"menus"."permission_code" IS NOT NULL',
        '"menus"."is_visible" IS NOT NULL',
        '"menus"."keep_alive" IS NOT NULL',
      ],
      [
        '"menus"."route_key" IS NULL',
        '"menus"."path" IS NOT NULL',
        '"menus"."permission_code" IS NULL',
        '"menus"."is_visible" IS NULL',
        '"menus"."keep_alive" IS NULL',
        '"menus"."is_external" IS NULL',
        '"menus"."url"',
      ],
    );
    expectCheck(
      "menus_external_menu_fields_check",
      [
        '"menus"."type" <> \'menu\' OR "menus"."is_external" IS FALSE OR (',
        '"menus"."is_external" IS TRUE',
        '"menus"."route_key" IS NULL',
        '"menus"."path" IS NOT NULL',
        '"menus"."permission_code" IS NOT NULL',
        '"menus"."is_visible" IS NOT NULL',
        '"menus"."keep_alive" IS NULL',
      ],
      [
        '"menus"."route_key" IS NOT NULL',
        '"menus"."path" IS NULL',
        '"menus"."permission_code" IS NULL',
        '"menus"."is_visible" IS NULL',
        '"menus"."keep_alive" IS NOT NULL',
        '"menus"."is_external" IS NULL',
        '"menus"."url"',
      ],
    );
    expectCheck(
      "menus_button_fields_check",
      [
        '"menus"."type" <> \'button\' OR (',
        '"menus"."parent_id" IS NOT NULL',
        '"menus"."route_key" IS NULL',
        '"menus"."path" IS NULL',
        '"menus"."icon" IS NULL',
        '"menus"."permission_code" IS NOT NULL',
        '"menus"."is_external" IS NULL',
        '"menus"."is_visible" IS NULL',
        '"menus"."keep_alive" IS NULL',
      ],
      [
        '"menus"."parent_id" IS NULL',
        '"menus"."route_key" IS NOT NULL',
        '"menus"."path" IS NOT NULL',
        '"menus"."icon" IS NOT NULL',
        '"menus"."permission_code" IS NULL',
        '"menus"."is_external" IS TRUE',
        '"menus"."is_external" IS FALSE',
        '"menus"."is_visible" IS NOT NULL',
        '"menus"."keep_alive" IS NOT NULL',
        '"menus"."url"',
      ],
    );

    const routeKeyIndex = config.indexes.find(
      (index) => index.config.name === "menus_organization_route_key_unique",
    );
    const pathIndex = config.indexes.find(
      (index) => index.config.name === "menus_organization_path_unique",
    );
    const routeKeyPredicate = routeKeyIndex?.config.where;
    const pathPredicate = pathIndex?.config.where;
    if (!routeKeyIndex || !pathIndex || !routeKeyPredicate || !pathPredicate) {
      throw new Error("menu partial unique indexes must be configured");
    }
    expect(
      routeKeyIndex.config.columns.map((column) => ("name" in column ? column.name : undefined)),
    ).toEqual(["organization_id", "route_key"]);
    expect(dialect.sqlToQuery(routeKeyPredicate).sql).toBe('"menus"."route_key" IS NOT NULL');
    expect(
      pathIndex.config.columns.map((column) => ("name" in column ? column.name : undefined)),
    ).toEqual(["organization_id", "path"]);
    expect(dialect.sqlToQuery(pathPredicate).sql).toBe('"menus"."path" IS NOT NULL');

    expect(config.uniqueConstraints.map((constraint) => constraint.getName())).toContain(
      "menus_organization_id_unique",
    );
    const parentForeignKey = config.foreignKeys.find(
      (constraint) => constraint.getName() === "menus_organization_parent_fk",
    );
    const parentReference = parentForeignKey?.reference();
    expect(parentReference?.columns.map((column) => column.name)).toEqual([
      "organization_id",
      "parent_id",
    ]);
    expect(parentReference?.foreignColumns.map((column) => column.name)).toEqual([
      "organization_id",
      "id",
    ]);
  });
});
