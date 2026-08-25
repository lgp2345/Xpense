import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { stripSqlComments } from "./bookkeeping-migration-test-helpers.js";

const migrationDirectory = new URL(
  "./migrations/20260810230000_organization_menus/",
  import.meta.url,
);
const migrationUrl = new URL("migration.sql", migrationDirectory);
const snapshotUrl = new URL("snapshot.json", migrationDirectory);

type SnapshotEntity = {
  entityType: string;
  name?: string;
  schema?: string;
  table?: string;
  type?: string;
  identity?: { type?: string } | null;
  columns?: string[];
  columnsTo?: string[];
  tableTo?: string;
  where?: string | null;
};

type MigrationSnapshot = {
  version: string;
  dialect: string;
  ddl: SnapshotEntity[];
};

async function readOptionalFile(url: URL): Promise<string | null> {
  try {
    return await readFile(url, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function requireSource(source: string | null): string {
  if (!source) {
    throw new Error("organization menu migration source is missing");
  }

  return source;
}

function findEntity(
  snapshot: MigrationSnapshot,
  predicate: (entity: SnapshotEntity) => boolean,
): SnapshotEntity {
  const entity = snapshot.ddl.find(predicate);
  if (!entity) {
    throw new Error("required migration snapshot entity is missing");
  }

  return entity;
}

/** 定位新增租赁菜单树的唯一 migration，避免测试绑定生成时间戳。 */
async function readRentalMenuMigration(): Promise<string> {
  const migrationsUrl = new URL("./migrations/", import.meta.url);
  const entries = await readdir(migrationsUrl, { withFileTypes: true });
  const candidates: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      const source = await readFile(new URL(`${entry.name}/migration.sql`, migrationsUrl), "utf8");
      const executableSql = stripSqlComments(source);
      if (
        executableSql.includes('CREATE TABLE "rental_properties"') &&
        executableSql.includes("'RentalProperties'")
      ) {
        candidates.push(executableSql);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (candidates.length !== 1) {
    throw new Error(`Expected one rental menu migration, found ${candidates.length}`);
  }

  return candidates[0] as string;
}

/**
 * This is a static migration-contract test, not a PostgreSQL execution test.
 * The workspace intentionally has no embedded PostgreSQL implementation, and
 * this task must not connect to or run a real database migration. Drizzle's
 * PostgreSQL migrator owns the outer transaction; this SQL must not open or
 * commit one itself. Phase 5 must replay this SQL against a disposable
 * PostgreSQL instance before release. This test never substitutes for that
 * database rehearsal.
 */
describe("organization menu UUID-to-identity migration contract", () => {
  it("delegates atomicity to Drizzle's PostgreSQL migration runner", async () => {
    const source = await readOptionalFile(migrationUrl);

    expect(source).not.toBeNull();

    const migration = requireSource(source);
    const preflightIndex = migration.indexOf(
      "RAISE EXCEPTION 'Cannot migrate legacy menus without organizations'",
    );
    const organizationCopyIndex = migration.indexOf(
      'FOR organization_row IN SELECT "id" FROM "organizations"',
    );
    const replacementIndex = migration.indexOf('ALTER TABLE "menus_next" RENAME TO "menus";');
    const primaryKeyRenameIndex = migration.indexOf(
      'ALTER TABLE "menus" RENAME CONSTRAINT "menus_next_pkey" TO "menus_pkey";',
    );
    const legacyDropIndex = migration.indexOf('DROP TABLE "menus";');
    const finalConstraintIndex = migration.indexOf('ADD CONSTRAINT "menus_organization_parent_fk"');

    expect(migration).toContain("Drizzle PostgreSQL migrator owns the outer transaction");
    expect(migration).not.toMatch(/^BEGIN;$/m);
    expect(migration).not.toMatch(/^COMMIT;$/m);
    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(organizationCopyIndex).toBeGreaterThan(preflightIndex);
    expect(finalConstraintIndex).toBeGreaterThan(organizationCopyIndex);
    expect(legacyDropIndex).toBeGreaterThan(finalConstraintIndex);
    expect(replacementIndex).toBeGreaterThan(legacyDropIndex);
    expect(primaryKeyRenameIndex).toBeGreaterThan(replacementIndex);
  });

  it("declares the executable copy contract for organization-local identity trees", async () => {
    const source = requireSource(await readOptionalFile(migrationUrl));

    expect(source).toMatch(/CREATE TYPE "menu_type" AS ENUM\s*\('directory', 'menu', 'button'\)/);
    expect(source).toMatch(
      /CREATE TABLE "menus_next" \([\s\S]*"id" integer GENERATED ALWAYS AS IDENTITY \(SEQUENCE NAME "menus_id_seq"\)/,
    );
    expect(source).toMatch(
      /CREATE TEMP TABLE "menu_id_map" \([\s\S]*"organization_id" uuid NOT NULL[\s\S]*"old_menu_id" uuid NOT NULL[\s\S]*"new_menu_id" integer NOT NULL/,
    );
    expect(source).toMatch(/PRIMARY KEY \("organization_id", "old_menu_id"\)/);
    expect(source).toMatch(/FOR organization_row IN SELECT "id" FROM "organizations"/);
    expect(source).toMatch(/FOR source_menu IN[\s\S]*ORDER BY "depth", "sort_order", "id"/);
    expect(source).toMatch(/INSERT INTO "menu_id_map"/);
    expect(source).toMatch(
      /RAISE EXCEPTION 'Cannot migrate internal menu % \(%\): no route mapping'/,
    );
    expect(source).toMatch(/RAISE EXCEPTION 'Cannot migrate legacy menu tree: orphan parent'/);
    expect(source).toMatch(/RAISE EXCEPTION 'Cannot migrate legacy menu tree: cycle detected'/);
    expect(source).toMatch(/RAISE EXCEPTION 'Cannot migrate legacy menu tree: unreachable node'/);
    expect(source).toMatch(/RAISE EXCEPTION 'Cannot migrate legacy menus without organizations'/);
    expect(source).toMatch(
      /WHERE "component_key" IS NULL[\s\S]*"path" = ''[\s\S]*"permission_code" IS NOT NULL[\s\S]*"permission_code" <> ''[\s\S]*RAISE EXCEPTION 'Cannot migrate legacy directory menu %: permission code is not allowed'/,
    );
    expect(source).toMatch(
      /WHERE "component_key" = 'DashboardPage'[\s\S]*"path" = '\/'[\s\S]*"permission_code" IS NOT NULL[\s\S]*"permission_code" <> ''[\s\S]*"permission_code" <> 'dashboard:read'[\s\S]*RAISE EXCEPTION 'Cannot migrate dashboard menu %: invalid permission code'/,
    );
    expect(source).toMatch(
      /WHERE \([\s\S]*"component_key" = 'AuditLogsPage'[\s\S]*\) IS NOT TRUE\s+LIMIT 1;/,
    );
    expect(source).toMatch(/RAISE EXCEPTION 'Menu migration count mismatch'/);
    expect(source).toMatch(/RAISE EXCEPTION 'Menu migration parent ownership mismatch'/);
    expect(source).toMatch(/"path" text/);
    expect(source).not.toMatch(/"url"\s+text/);
  });

  it("adds and validates the menu-management tree with the copied access-control directory", async () => {
    const source = requireSource(await readOptionalFile(migrationUrl));

    expect(source).toMatch(
      /\('menus:read', 'menus:read', 'menus', 'read', 'menus:read'\)[\s\S]*\('menus:create', 'menus:create', 'menus', 'create', 'menus:create'\)[\s\S]*\('menus:update', 'menus:update', 'menus', 'update', 'menus:update'\)[\s\S]*\('menus:delete', 'menus:delete', 'menus', 'delete', 'menus:delete'\)/,
    );
    expect(source).toMatch(
      /"roles"\."key" IN \('owner', 'admin'\)\s+AND "roles"\."is_system" IS TRUE\s+AND "roles"\."organization_id" IS NULL\s+AND "permissions"\."key" IN \('menus:read', 'menus:create', 'menus:update', 'menus:delete'\)/,
    );
    expect(source).toMatch(
      /'menu',\s+'菜单管理',\s+menu_management_parent_id,\s+'Menus',\s+NULL,\s+'ShieldCheck',\s+'menus:read'/,
    );
    expect(source).toMatch(/'Menus'::text, '新增菜单'::text, 'menus:create'::text, 100/);
    expect(source).toMatch(/'Menus'::text, '编辑菜单'::text, 'menus:update'::text, 110/);
    expect(source).toMatch(/'Menus'::text, '删除菜单'::text, 'menus:delete'::text, 120/);
    expect(source).toMatch(
      /SELECT "menu_id_map"\."new_menu_id"[\s\S]*INTO menu_management_parent_id[\s\S]*FROM "menus" AS "access_control_directory"[\s\S]*JOIN "menu_id_map"[\s\S]*"old_menu_id" = "access_control_directory"\."id"[\s\S]*"access_control_directory"\."name" = '访问控制'[\s\S]*LIMIT 1;/,
    );
    expect(source).toContain(
      "A missing legacy access-control directory leaves menu management at the root.",
    );
    expect(source).not.toMatch(/AND "route_key" = 'Roles';/);
    expect(source).toMatch(/"menus_next"\."route_key" = button_row\."parent_route_key"/);
    expect(source).toMatch(/"menus_next"\."route_key" = 'Menus'/);
    expect(source).toMatch(/"menus_next"\."route_key" IS NULL/);
    expect(source).toMatch(/RAISE EXCEPTION 'Menu migration management menu count mismatch'/);
    expect(source).toMatch(/RAISE EXCEPTION 'Menu migration management parent mismatch'/);
    expect(source).toMatch(/RAISE EXCEPTION 'Menu migration management button count mismatch'/);
    expect(source).toMatch(/RAISE EXCEPTION 'Menu migration management button parent mismatch'/);
  });

  it("records the final Drizzle schema for identity ids, no url column, and organization-local parents", async () => {
    const source = await readOptionalFile(snapshotUrl);

    expect(source).not.toBeNull();

    const snapshot = JSON.parse(requireSource(source)) as MigrationSnapshot;
    expect(snapshot.version).toBe("8");
    expect(snapshot.dialect).toBe("postgres");

    expect(
      findEntity(
        snapshot,
        (entity) => entity.entityType === "enums" && entity.name === "menu_type",
      ),
    ).toBeDefined();
    expect(
      findEntity(
        snapshot,
        (entity) =>
          entity.entityType === "columns" && entity.table === "menus" && entity.name === "id",
      ).identity?.type,
    ).toBe("always");
    expect(
      findEntity(
        snapshot,
        (entity) =>
          entity.entityType === "columns" &&
          entity.table === "menus" &&
          entity.name === "parent_id",
      ).type,
    ).toBe("integer");
    expect(
      snapshot.ddl.some(
        (entity) =>
          entity.entityType === "columns" && entity.table === "menus" && entity.name === "url",
      ),
    ).toBe(false);

    const parentForeignKey = findEntity(
      snapshot,
      (entity) => entity.entityType === "fks" && entity.name === "menus_organization_parent_fk",
    );
    expect(parentForeignKey.columns).toEqual(["organization_id", "parent_id"]);
    expect(parentForeignKey.tableTo).toBe("menus");
    expect(parentForeignKey.columnsTo).toEqual(["organization_id", "id"]);
  });
});

describe("rental menu bootstrap contract", () => {
  it("only inserts missing rental nodes for every existing organization", async () => {
    const source = await readRentalMenuMigration();

    expect(source).toContain('FOR organization_row IN SELECT "id" FROM "organizations" LOOP');
    expect(source).toContain("AND \"route_key\" = 'RentalProperties'");
    expect(source).toContain("AND \"route_key\" = 'RentalPropertyDetail'");
    expect(source).toContain('AND "permission_code" = button_row.permission_key');
    expect(source).toContain("'directory',");
    expect(source).toContain("'租赁管理',");
    expect(source).toContain("'menu',");
    expect(source).toContain("'房产管理',");
    expect(source).toContain("'房产详情',");
    expect(source).toContain("FALSE,\n        FALSE,\n        FALSE,");
    for (const button of [
      "('新增房产', 'rental_properties:create', 100)",
      "('编辑房产', 'rental_properties:update', 110)",
      "('删除房产', 'rental_properties:delete', 120)",
      "('新增空间', 'rental_spaces:create', 130)",
      "('编辑空间', 'rental_spaces:update', 140)",
      "('删除空间', 'rental_spaces:delete', 150)",
    ]) {
      expect(source).toContain(button);
    }
    expect(source).not.toMatch(/\b(?:UPDATE|DELETE FROM) "menus"/);
    expect(source).not.toMatch(/\b(?:DROP|TRUNCATE)\b/i);
  });
});
