import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

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

/**
 * This is a static migration-contract test, not a PostgreSQL execution test.
 * The workspace intentionally has no embedded PostgreSQL implementation, and
 * this task must not connect to or run a real database migration. Phase 5 must
 * replay this SQL against a disposable PostgreSQL instance before release.
 */
describe("organization menu UUID-to-identity migration contract", () => {
  it("is present as one PostgreSQL transaction with rollback-safe replacement ordering", async () => {
    const source = await readOptionalFile(migrationUrl);

    expect(source).not.toBeNull();

    const migration = requireSource(source);
    const beginIndex = migration.indexOf("BEGIN;");
    const commitIndex = migration.lastIndexOf("COMMIT;");
    const replacementIndex = migration.indexOf('ALTER TABLE "menus_next" RENAME TO "menus";');
    const legacyDropIndex = migration.indexOf('DROP TABLE "menus";');
    const finalConstraintIndex = migration.indexOf('ADD CONSTRAINT "menus_organization_parent_fk"');

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeGreaterThan(beginIndex);
    expect(finalConstraintIndex).toBeGreaterThan(beginIndex);
    expect(legacyDropIndex).toBeGreaterThan(finalConstraintIndex);
    expect(replacementIndex).toBeGreaterThan(legacyDropIndex);
    expect(commitIndex).toBeGreaterThan(legacyDropIndex);
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
    expect(source).toMatch(/RAISE EXCEPTION 'Menu migration count mismatch'/);
    expect(source).toMatch(/RAISE EXCEPTION 'Menu migration parent ownership mismatch'/);
    expect(source).toMatch(/"path" text/);
    expect(source).not.toMatch(/"url"\s+text/);
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
