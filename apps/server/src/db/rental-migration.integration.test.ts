import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { stripSqlComments } from "./bookkeeping-migration-test-helpers.js";

type SnapshotEntity = {
  entityType: string;
  name?: string;
  table?: string;
};

type MigrationSnapshot = {
  version: string;
  dialect: string;
  ddl: SnapshotEntity[];
};

type RentalMigrationArtifact = {
  directoryName: string;
  migration: string;
  snapshot: MigrationSnapshot;
};

const rentalPermissions = [
  "rental_properties:read",
  "rental_properties:create",
  "rental_properties:update",
  "rental_properties:delete",
  "rental_spaces:read",
  "rental_spaces:create",
  "rental_spaces:update",
  "rental_spaces:delete",
] as const;

/** 定位唯一包含租赁房产和空间 DDL 的生成 migration，避免耦合时间戳目录名。 */
async function readRentalMigration(): Promise<RentalMigrationArtifact> {
  const migrationsUrl = new URL("./migrations/", import.meta.url);
  const entries = await readdir(migrationsUrl, { withFileTypes: true });
  const candidates: RentalMigrationArtifact[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directoryUrl = new URL(`${entry.name}/`, migrationsUrl);
    let migration: string;
    let snapshotSource: string;

    try {
      [migration, snapshotSource] = await Promise.all([
        readFile(new URL("migration.sql", directoryUrl), "utf8"),
        readFile(new URL("snapshot.json", directoryUrl), "utf8"),
      ]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }

    const executableSql = stripSqlComments(migration);
    if (
      executableSql.includes('CREATE TABLE "rental_properties"') &&
      executableSql.includes('CREATE TABLE "rental_spaces"')
    ) {
      candidates.push({
        directoryName: entry.name,
        migration,
        snapshot: JSON.parse(snapshotSource) as MigrationSnapshot,
      });
    }
  }

  if (candidates.length !== 1) {
    throw new Error(`Expected one rental migration, found ${candidates.length}`);
  }

  return candidates[0] as RentalMigrationArtifact;
}

async function readTableComment(source: string, table: string): Promise<string | null> {
  return source.match(new RegExp(`COMMENT ON TABLE "${table}" IS '([^']*)';`))?.[1] ?? null;
}

async function readColumnComment(
  source: string,
  table: string,
  column: string,
): Promise<string | null> {
  return (
    source.match(new RegExp(`COMMENT ON COLUMN "${table}"\\."${column}" IS '([^']*)';`))?.[1] ??
    null
  );
}

async function readTypeComment(source: string, type: string): Promise<string | null> {
  return source.match(new RegExp(`COMMENT ON TYPE "${type}" IS '([^']*)';`))?.[1] ?? null;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function executableSql(source: string): string {
  return stripSqlComments(source);
}

function readRentalMenuBootstrap(source: string): string {
  const bootstrap = executableSql(source).match(/DO \$\$[\s\S]*?END \$\$;/)?.[0];
  if (!bootstrap) {
    throw new Error("rental menu bootstrap SQL is missing");
  }

  return bootstrap;
}

describe("rental property and space migration contract", () => {
  it("contains the generated rental tables, enums, scope constraints and active sibling indexes", async () => {
    const { migration, snapshot } = await readRentalMigration();
    const executableSql = stripSqlComments(migration);

    expect(snapshot.version).toBe("8");
    expect(snapshot.dialect).toBe("postgres");
    for (const table of ["rental_properties", "rental_spaces"]) {
      expect(snapshot.ddl).toContainEqual(
        expect.objectContaining({ entityType: "tables", name: table }),
      );
    }
    for (const type of ["rental_property_type", "rental_space_type"]) {
      expect(snapshot.ddl).toContainEqual(
        expect.objectContaining({ entityType: "enums", name: type }),
      );
    }
    for (const constraint of [
      "rental_properties_organization_ledger_unique",
      "rental_properties_organization_ledger_fk",
      "rental_spaces_organization_property_fk",
      "rental_spaces_parent_scope_fk",
      "rental_spaces_active_root_name_unique",
      "rental_spaces_active_child_name_unique",
      "rental_spaces_active_root_code_unique",
      "rental_spaces_active_child_code_unique",
    ]) {
      expect(executableSql).toContain(`"${constraint}"`);
    }
  });

  it("documents every rental enum, table and column in Chinese", async () => {
    const { migration } = await readRentalMigration();
    const executableSql = stripSqlComments(migration);

    expect(await readTableComment(executableSql, "rental_properties")).toBe("租赁房产档案");
    expect(await readTableComment(executableSql, "rental_spaces")).toBe("租赁房产下的空间树");
    expect(await readColumnComment(executableSql, "rental_spaces", "is_rentable")).toContain(
      "未来合同",
    );
    expect(await readTypeComment(executableSql, "rental_property_type")).toContain("房产类型");
    expect(await readTypeComment(executableSql, "rental_space_type")).toContain("空间类型");

    for (const [table, columns] of Object.entries({
      rental_properties: [
        "id",
        "organization_id",
        "ledger_id",
        "name",
        "type",
        "custom_type_name",
        "country_code",
        "province",
        "city",
        "district",
        "address_line",
        "note",
        "is_active",
        "created_by_user_id",
        "deleted_at",
        "deleted_by_user_id",
        "created_at",
        "updated_at",
      ],
      rental_spaces: [
        "id",
        "organization_id",
        "property_id",
        "parent_id",
        "name",
        "code",
        "type",
        "custom_type_name",
        "is_rentable",
        "is_active",
        "sort_order",
        "created_by_user_id",
        "deleted_at",
        "deleted_by_user_id",
        "created_at",
        "updated_at",
      ],
    })) {
      for (const column of columns) {
        expect(await readColumnComment(executableSql, table, column)).not.toBeNull();
      }
    }
  });

  it("incrementally grants rental permissions and adds the rental menu tree without rental data", async () => {
    const { migration } = await readRentalMigration();
    const executableSql = stripSqlComments(migration);

    for (const permission of rentalPermissions) {
      expect(executableSql).toContain(`('${permission}', '${permission}'`);
    }
    expect(executableSql).toMatch(/"roles"\."key" IN \('owner', 'admin'\)/);
    expect(executableSql).toMatch(/"roles"\."key" IN \('member', 'viewer'\)/);
    expect(executableSql).toContain("'RentalProperties'");
    expect(executableSql).toContain("'RentalPropertyDetail'");
    for (const permission of rentalPermissions.filter((key) => !key.endsWith(":read"))) {
      expect(executableSql).toContain(`'${permission}'`);
    }
    expect(executableSql).not.toContain('INSERT INTO "rental_properties"');
    expect(executableSql).not.toContain('INSERT INTO "rental_spaces"');
    expect(executableSql).not.toMatch(/\b(?:UPDATE|DELETE FROM) "menus"/);
  });

  it("keeps the generated migration in a timestamped directory", async () => {
    const { directoryName } = await readRentalMigration();

    expect(directoryName).toMatch(/^\d{14}_[a-z0-9_]+$/);
  });

  it("rehearses the migration in a disposable schema when a dedicated database is configured", async (context) => {
    const databaseUrl = process.env.RENTAL_MIGRATION_TEST_DATABASE_URL;
    if (!databaseUrl) {
      context.skip(
        "RENTAL_MIGRATION_TEST_DATABASE_URL is not configured; skipped disposable PostgreSQL rehearsal",
      );
      return;
    }

    const { migration } = await readRentalMigration();
    const schema = `rental_migration_${randomUUID().replaceAll("-", "")}`;
    const quotedSchema = quoteIdentifier(schema);
    const client = postgres(databaseUrl, { max: 1 });

    try {
      await client.unsafe(`CREATE SCHEMA ${quotedSchema}`);
      await client.begin(async (sql) => {
        await sql.unsafe(`SET LOCAL search_path TO ${quotedSchema}`);
        await sql.unsafe(
          `CREATE FUNCTION gen_random_uuid() RETURNS uuid LANGUAGE sql VOLATILE AS 'SELECT md5(random()::text || clock_timestamp()::text)::uuid'`,
        );
        await sql.unsafe(`
          CREATE TABLE "users" ("id" uuid PRIMARY KEY);
          CREATE TABLE "organizations" ("id" uuid PRIMARY KEY, "created_by_user_id" uuid NOT NULL);
          CREATE TABLE "ledgers" (
            "id" uuid PRIMARY KEY,
            "organization_id" uuid NOT NULL,
            CONSTRAINT "ledgers_organization_id_unique" UNIQUE ("organization_id", "id")
          );
          CREATE TABLE "permissions" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "key" text NOT NULL UNIQUE,
            "name" text NOT NULL,
            "resource" text NOT NULL,
            "action" text NOT NULL,
            "description" text NOT NULL
          );
          CREATE TABLE "roles" (
            "id" uuid PRIMARY KEY,
            "key" text NOT NULL,
            "is_system" boolean NOT NULL,
            "organization_id" uuid
          );
          CREATE TABLE "role_permissions" (
            "role_id" uuid NOT NULL,
            "permission_id" uuid NOT NULL,
            PRIMARY KEY ("role_id", "permission_id")
          );
          CREATE TYPE "menu_type" AS ENUM ('directory', 'menu', 'button');
          CREATE TABLE "menus" (
            "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            "organization_id" uuid NOT NULL,
            "type" "menu_type" NOT NULL,
            "name" text NOT NULL,
            "parent_id" integer,
            "route_key" text,
            "path" text,
            "icon" text,
            "permission_code" text,
            "is_external" boolean,
            "is_visible" boolean,
            "keep_alive" boolean,
            "sort_order" integer NOT NULL DEFAULT 0
          );
          INSERT INTO "users" ("id") VALUES ('00000000-0000-0000-0000-000000000001');
          INSERT INTO "organizations" ("id", "created_by_user_id") VALUES
            ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001'),
            ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001');
          INSERT INTO "ledgers" ("id", "organization_id") VALUES
            ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011');
          INSERT INTO "roles" ("id", "key", "is_system", "organization_id") VALUES
            ('00000000-0000-0000-0000-000000000031', 'owner', TRUE, NULL),
            ('00000000-0000-0000-0000-000000000032', 'admin', TRUE, NULL),
            ('00000000-0000-0000-0000-000000000033', 'member', TRUE, NULL),
            ('00000000-0000-0000-0000-000000000034', 'viewer', TRUE, NULL);
          INSERT INTO "menus" ("organization_id", "type", "name", "is_visible") VALUES
            ('00000000-0000-0000-0000-000000000011', 'directory', '保留的自定义菜单', TRUE);
        `);

        await sql.unsafe(executableSql(migration));
        await sql.unsafe(readRentalMenuBootstrap(migration));

        const [propertyComment] = await sql<[{ comment: string | null }]>`
          SELECT obj_description(${`${schema}.rental_properties`}::regclass, 'pg_class') AS comment
        `;
        const [rentableComment] = await sql<[{ comment: string | null }]>`
          SELECT col_description(${`${schema}.rental_spaces`}::regclass, attnum) AS comment
          FROM pg_attribute
          WHERE attrelid = ${`${schema}.rental_spaces`}::regclass
            AND attname = 'is_rentable'
        `;
        const [spaceTypeComment] = await sql<[{ comment: string | null }]>`
          SELECT obj_description(${`${schema}.rental_space_type`}::regtype::oid, 'pg_type') AS comment
        `;

        expect(propertyComment?.comment).toBe("租赁房产档案");
        expect(rentableComment?.comment).toContain("未来合同");
        expect(spaceTypeComment?.comment).toContain("空间类型");
        expect(await sql`SELECT count(*)::int AS count FROM "rental_properties"`).toEqual([
          { count: 0 },
        ]);
        expect(await sql`SELECT count(*)::int AS count FROM "rental_spaces"`).toEqual([
          { count: 0 },
        ]);
        expect(
          await sql`SELECT count(*)::int AS count FROM "permissions" WHERE "key" LIKE 'rental_%'`,
        ).toEqual([{ count: 8 }]);
        expect(
          await sql`
            SELECT "roles"."key", count("role_permissions"."permission_id")::int AS count
            FROM "roles"
            LEFT JOIN "role_permissions" ON "role_permissions"."role_id" = "roles"."id"
            WHERE "roles"."key" IN ('owner', 'admin', 'member', 'viewer')
            GROUP BY "roles"."key"
            ORDER BY "roles"."key"
          `,
        ).toEqual([
          { key: "admin", count: 8 },
          { key: "member", count: 2 },
          { key: "owner", count: 8 },
          { key: "viewer", count: 2 },
        ]);
        expect(
          await sql`
            SELECT "organization_id", count(*)::int AS count
            FROM "menus"
            WHERE "name" = '租赁管理' OR "route_key" IN ('RentalProperties', 'RentalPropertyDetail')
              OR "permission_code" IN (
                'rental_properties:create', 'rental_properties:update', 'rental_properties:delete',
                'rental_spaces:create', 'rental_spaces:update', 'rental_spaces:delete'
              )
            GROUP BY "organization_id"
            ORDER BY "organization_id"
          `,
        ).toEqual([
          { organization_id: "00000000-0000-0000-0000-000000000011", count: 9 },
          { organization_id: "00000000-0000-0000-0000-000000000012", count: 9 },
        ]);
        expect(
          await sql`
            SELECT count(*)::int AS count FROM "menus"
            WHERE "name" = '保留的自定义菜单'
          `,
        ).toEqual([{ count: 1 }]);

        const organizationId = "00000000-0000-0000-0000-000000000011";
        const userId = "00000000-0000-0000-0000-000000000001";
        const firstLedgerId = "00000000-0000-0000-0000-000000000021";
        const secondLedgerId = "00000000-0000-0000-0000-000000000022";
        const firstPropertyId = "00000000-0000-0000-0000-000000000041";
        const secondPropertyId = "00000000-0000-0000-0000-000000000042";
        const parentSpaceId = "00000000-0000-0000-0000-000000000051";
        const activeSpaceId = "00000000-0000-0000-0000-000000000052";

        await sql`
          INSERT INTO "ledgers" ("id", "organization_id")
          VALUES (${secondLedgerId}, ${organizationId})
        `;
        await sql`
          INSERT INTO "rental_properties" (
            "id", "organization_id", "ledger_id", "name", "type", "country_code",
            "address_line", "created_by_user_id"
          ) VALUES (
            ${firstPropertyId}, ${organizationId}, ${firstLedgerId}, '房产甲',
            'residential_unit', 'CN', '测试地址甲', ${userId}
          )
        `;
        await expect(
          sql.savepoint(
            async (savepoint) =>
              savepoint`
              INSERT INTO "rental_properties" (
                "id", "organization_id", "ledger_id", "name", "type", "country_code",
                "address_line", "created_by_user_id"
              ) VALUES (
                '00000000-0000-0000-0000-000000000043', ${organizationId}, ${firstLedgerId}, '重复账本房产',
                'residential_unit', 'CN', '测试地址重复', ${userId}
              )
            `,
          ),
        ).rejects.toMatchObject({
          code: "23505",
          constraint: "rental_properties_organization_ledger_unique",
        });
        await sql`
          INSERT INTO "rental_properties" (
            "id", "organization_id", "ledger_id", "name", "type", "country_code",
            "address_line", "created_by_user_id"
          ) VALUES (
            ${secondPropertyId}, ${organizationId}, ${secondLedgerId}, '房产乙',
            'residential_unit', 'CN', '测试地址乙', ${userId}
          )
        `;
        await sql`
          INSERT INTO "rental_spaces" (
            "id", "organization_id", "property_id", "name", "code", "type", "created_by_user_id"
          ) VALUES (
            ${parentSpaceId}, ${organizationId}, ${firstPropertyId}, '一层', 'F1', 'floor', ${userId}
          )
        `;
        await sql`
          INSERT INTO "rental_spaces" (
            "id", "organization_id", "property_id", "parent_id", "name", "code", "type",
            "is_rentable", "created_by_user_id"
          ) VALUES (
            ${activeSpaceId}, ${organizationId}, ${firstPropertyId}, ${parentSpaceId}, '101', 'A101', 'unit',
            TRUE, ${userId}
          )
        `;
        await expect(
          sql.savepoint(
            async (savepoint) =>
              savepoint`
              INSERT INTO "rental_spaces" (
                "id", "organization_id", "property_id", "parent_id", "name", "type", "created_by_user_id"
              ) VALUES (
                '00000000-0000-0000-0000-000000000053', ${organizationId}, ${secondPropertyId}, ${parentSpaceId},
                '跨房产父空间', 'unit', ${userId}
              )
            `,
          ),
        ).rejects.toMatchObject({ code: "23503", constraint: "rental_spaces_parent_scope_fk" });
        await expect(
          sql.savepoint(
            async (savepoint) =>
              savepoint`
              INSERT INTO "rental_spaces" (
                "id", "organization_id", "property_id", "parent_id", "name", "code", "type",
                "created_by_user_id"
              ) VALUES (
                '00000000-0000-0000-0000-000000000054', ${organizationId}, ${firstPropertyId}, ${parentSpaceId},
                '101', 'A102', 'unit', ${userId}
              )
            `,
          ),
        ).rejects.toMatchObject({
          code: "23505",
          constraint: "rental_spaces_active_child_name_unique",
        });
        await expect(
          sql.savepoint(
            async (savepoint) =>
              savepoint`
              INSERT INTO "rental_spaces" (
                "id", "organization_id", "property_id", "parent_id", "name", "code", "type",
                "created_by_user_id"
              ) VALUES (
                '00000000-0000-0000-0000-000000000055', ${organizationId}, ${firstPropertyId}, ${parentSpaceId},
                '102', 'A101', 'unit', ${userId}
              )
            `,
          ),
        ).rejects.toMatchObject({
          code: "23505",
          constraint: "rental_spaces_active_child_code_unique",
        });
        await sql`
          INSERT INTO "rental_spaces" (
            "id", "organization_id", "property_id", "parent_id", "name", "code", "type", "is_active",
            "created_by_user_id"
          ) VALUES (
            '00000000-0000-0000-0000-000000000056', ${organizationId}, ${firstPropertyId}, ${parentSpaceId},
            '101', 'A101', 'unit', FALSE, ${userId}
          )
        `;
        await sql`
          INSERT INTO "rental_spaces" (
            "id", "organization_id", "property_id", "parent_id", "name", "code", "type", "deleted_at",
            "created_by_user_id"
          ) VALUES (
            '00000000-0000-0000-0000-000000000057', ${organizationId}, ${firstPropertyId}, ${parentSpaceId},
            '101', 'A101', 'unit', now(), ${userId}
          )
        `;
        expect(
          await sql`
            SELECT count(*)::int AS count
            FROM "rental_spaces"
            WHERE "parent_id" = ${parentSpaceId}
              AND "name" = '101'
              AND "code" = 'A101'
          `,
        ).toEqual([{ count: 3 }]);
      });
    } finally {
      await client.unsafe(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
      await client.end({ timeout: 5 });
    }
  });
});
