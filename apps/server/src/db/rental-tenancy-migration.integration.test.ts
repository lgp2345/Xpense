import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { stripSqlComments } from "./bookkeeping-migration-test-helpers.js";

type SnapshotEntity = {
  entityType: string;
  name?: string;
  table?: string;
  values?: string[];
};

type MigrationArtifact = {
  directoryName: string;
  migration: string;
  snapshot: { version: string; dialect: string; ddl: SnapshotEntity[] };
};

const tenancyTables = [
  "rental_tenants",
  "rental_contract_number_counters",
  "rental_contracts",
  "rental_contract_spaces",
  "rental_contract_party_periods",
  "rental_contract_changes",
  "rental_contract_deposit_terms",
] as const;

const tenancyColumns = {
  rental_contract_changes: [
    "id",
    "organization_id",
    "contract_id",
    "type",
    "effective_date",
    "reason",
    "before_party_refs",
    "after_party_refs",
    "created_by_user_id",
    "created_at",
  ],
  rental_contract_deposit_terms: [
    "id",
    "organization_id",
    "contract_id",
    "type",
    "custom_name",
    "calculation_mode",
    "fixed_amount_minor",
    "rent_multiple",
    "final_amount_minor",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  rental_contract_number_counters: ["organization_id", "year", "last_value", "updated_at"],
  rental_contract_party_periods: [
    "id",
    "organization_id",
    "contract_id",
    "tenant_id",
    "valid_from",
    "valid_to",
    "is_primary_payer",
    "tenant_type_snapshot",
    "tenant_name_snapshot",
    "phone_snapshot",
    "email_snapshot",
    "primary_contact_name_snapshot",
    "document_country_code_snapshot",
    "document_type_snapshot",
    "document_type_other_name_snapshot",
    "masked_document_number_snapshot",
    "identity_snapshot_ciphertext",
    "identity_snapshot_key_version",
    "created_at",
  ],
  rental_contract_spaces: [
    "id",
    "organization_id",
    "contract_id",
    "property_id",
    "space_id",
    "space_name_snapshot",
    "space_code_snapshot",
    "space_path_snapshot",
    "rent_allocation_minor",
    "created_at",
  ],
  rental_contracts: [
    "id",
    "organization_id",
    "property_id",
    "contract_number",
    "external_contract_number",
    "status",
    "start_date",
    "end_date",
    "rent_amount_minor",
    "billing_anchor",
    "payment_interval_months",
    "due_days_before",
    "renewed_from_contract_id",
    "cancelled_at",
    "cancelled_by_user_id",
    "cancellation_reason",
    "termination_date",
    "termination_recorded_at",
    "terminated_by_user_id",
    "termination_reason",
    "note",
    "created_by_user_id",
    "updated_by_user_id",
    "deleted_at",
    "deleted_by_user_id",
    "created_at",
    "updated_at",
  ],
  rental_tenants: [
    "id",
    "organization_id",
    "type",
    "name",
    "phone",
    "email",
    "primary_contact_name",
    "document_country_code",
    "document_type",
    "document_type_other_name",
    "document_number_lookup_hash",
    "masked_document_number",
    "sensitive_identity_ciphertext",
    "sensitive_identity_key_version",
    "is_active",
    "note",
    "created_by_user_id",
    "updated_by_user_id",
    "deleted_at",
    "deleted_by_user_id",
    "created_at",
    "updated_at",
  ],
} as const satisfies Record<(typeof tenancyTables)[number], readonly string[]>;

const tenancyEnumValues = {
  rental_billing_anchor: ["contract_start", "calendar_month"],
  rental_contract_change_type: ["parties_changed"],
  rental_contract_status: ["draft", "confirmed", "cancelled", "terminated"],
  rental_deposit_calculation_mode: ["fixed_amount", "rent_multiple"],
  rental_deposit_type: ["rental", "utility", "access_card", "other"],
  rental_gender: ["male", "female", "unspecified"],
  rental_identity_document_type: [
    "national_id",
    "passport",
    "residence_permit",
    "business_registration",
    "other",
  ],
  rental_tenant_type: ["individual", "company"],
} as const;

const tenancyPermissions = [
  "rental_tenants:read",
  "rental_tenants:create",
  "rental_tenants:update",
  "rental_tenants:delete",
  "rental_tenants:sensitive_read",
  "rental_contracts:read",
  "rental_contracts:create",
  "rental_contracts:update",
  "rental_contracts:delete",
] as const;

const tenancyRoutes = [
  "RentalTenants",
  "RentalTenantDetail",
  "RentalContracts",
  "RentalContractDetail",
  "RentalContractCreate",
] as const;

async function readMigrationContaining(table: string): Promise<MigrationArtifact> {
  const migrationsUrl = new URL("./migrations/", import.meta.url);
  const entries = await readdir(migrationsUrl, { withFileTypes: true });
  const candidates: MigrationArtifact[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directoryUrl = new URL(`${entry.name}/`, migrationsUrl);
    try {
      const [migration, snapshotSource] = await Promise.all([
        readFile(new URL("migration.sql", directoryUrl), "utf8"),
        readFile(new URL("snapshot.json", directoryUrl), "utf8"),
      ]);

      if (stripSqlComments(migration).includes(`CREATE TABLE "${table}"`)) {
        candidates.push({
          directoryName: entry.name,
          migration,
          snapshot: JSON.parse(snapshotSource) as MigrationArtifact["snapshot"],
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (candidates.length !== 1) {
    throw new Error(`Expected one migration containing ${table}, found ${candidates.length}`);
  }

  return candidates[0] as MigrationArtifact;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function readComment(source: string, target: "TYPE" | "TABLE", name: string): string | null {
  return source.match(new RegExp(`COMMENT ON ${target} "${name}" IS '([^']+)';`))?.[1] ?? null;
}

function readColumnComment(source: string, table: string, column: string): string | null {
  return (
    source.match(new RegExp(`COMMENT ON COLUMN "${table}"\\."${column}" IS '([^']+)';`))?.[1] ??
    null
  );
}

function readIncrementalBootstrap(source: string): string {
  const bootstrap = stripSqlComments(source).match(
    /INSERT INTO "permissions"[\s\S]*?DO \$\$[\s\S]*?END \$\$;/,
  )?.[0];

  if (!bootstrap) {
    throw new Error("tenant and contract incremental bootstrap SQL is missing");
  }

  return bootstrap;
}

describe("rental tenant and contract migration contract", () => {
  it("contains the additive typed contract action migration", async () => {
    const { migration, snapshot } = await readMigrationContaining("rental_contract_actions");
    const executable = stripSqlComments(migration);

    expect(snapshot).toMatchObject({ dialect: "postgres" });
    expect(executable).toContain(
      "CREATE TYPE \"rental_contract_action_type\" AS ENUM('termination_revoked');",
    );
    expect(executable).toContain('CREATE TABLE "rental_contract_actions"');
    expect(executable).toContain(
      'CONSTRAINT "rental_contract_actions_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 1000)',
    );
    expect(executable).toContain(
      'CONSTRAINT "rental_contract_actions_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id")',
    );
    expect(executable).toContain(
      'CREATE INDEX "rental_contract_actions_contract_created_at_idx" ON "rental_contract_actions" ("organization_id","contract_id","created_at");',
    );
    expect(executable).toContain(
      'ALTER TABLE "rental_contract_actions" ADD CONSTRAINT "rental_contract_actions_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");',
    );
    expect(executable).not.toContain("ON DELETE CASCADE");
    expect(migration).toMatch(
      /COMMENT ON TYPE "rental_contract_action_type" IS '[^']*[\u3400-\u9fff]/u,
    );
    expect(migration).toMatch(
      /COMMENT ON TABLE "rental_contract_actions" IS '[^']*[\u3400-\u9fff]/u,
    );
    const columns = snapshot.ddl
      .filter(
        (entity) => entity.entityType === "columns" && entity.table === "rental_contract_actions",
      )
      .flatMap((entity) => (entity.name ? [entity.name] : []));
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) {
      expect(readColumnComment(migration, "rental_contract_actions", column)).toMatch(
        /[\u3400-\u9fff]/u,
      );
    }
  });

  it("keeps exactly one generated timestamped tenancy migration", async () => {
    const artifact = await readMigrationContaining("rental_tenants");

    expect(artifact.directoryName).toMatch(/^\d{14}_rental_tenants_contracts$/);
    expect(artifact.snapshot).toMatchObject({ version: "8", dialect: "postgres" });
  });

  it("contains enum values, tables, a partial index, and exact composite scope FKs", async () => {
    const { migration, snapshot } = await readMigrationContaining("rental_tenants");
    const executable = stripSqlComments(migration);

    for (const [name, values] of Object.entries(tenancyEnumValues)) {
      expect(snapshot.ddl).toContainEqual(
        expect.objectContaining({ entityType: "enums", name, values: [...values] }),
      );
    }
    for (const table of tenancyTables) {
      expect(snapshot.ddl).toContainEqual(
        expect.objectContaining({ entityType: "tables", name: table }),
      );
    }

    expect(executable).toContain(
      'CREATE UNIQUE INDEX "rental_tenants_active_document_hash_unique" ON "rental_tenants" ("organization_id","document_number_lookup_hash") WHERE "deleted_at" IS NULL AND "document_number_lookup_hash" IS NOT NULL;',
    );
    for (const constraint of [
      '"rental_contracts_property_scope_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "rental_properties"("organization_id","id")',
      '"rental_contracts_renewed_from_scope_fk" FOREIGN KEY ("organization_id","property_id","renewed_from_contract_id") REFERENCES "rental_contracts"("organization_id","property_id","id")',
      '"rental_contract_spaces_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id","property_id") REFERENCES "rental_contracts"("organization_id","id","property_id")',
      '"rental_contract_spaces_space_scope_fk" FOREIGN KEY ("organization_id","property_id","space_id") REFERENCES "rental_spaces"("organization_id","property_id","id")',
      '"rental_contract_party_periods_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id")',
      '"rental_contract_party_periods_tenant_scope_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "rental_tenants"("organization_id","id")',
      '"rental_contract_changes_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id")',
      '"rental_contract_deposit_terms_contract_scope_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "rental_contracts"("organization_id","id")',
    ]) {
      expect(executable).toContain(constraint);
    }

    expect(executable).not.toContain('ALTER TABLE "rental_spaces" ADD COLUMN "updated_by_user_id"');
  });

  it("allows confirmed party snapshots without sensitive identity material", async () => {
    const { migration, snapshot } = await readMigrationContaining("rental_tenants");
    const executable = stripSqlComments(migration);
    const snapshotCheck = executable.match(
      /CONSTRAINT "rental_contract_party_periods_snapshot_fields_check" CHECK \(([^\n]+)\)/,
    )?.[1];

    expect(snapshotCheck).toBeDefined();
    expect(snapshotCheck).toContain(
      '"valid_from" IS NOT NULL AND "valid_to" IS NOT NULL AND "tenant_type_snapshot" IS NOT NULL AND "tenant_name_snapshot" IS NOT NULL',
    );
    expect(snapshotCheck).not.toContain('"identity_snapshot_ciphertext" IS NOT NULL');
    expect(snapshotCheck).not.toContain('"identity_snapshot_key_version" > 0');
    expect(snapshot.ddl).toContainEqual(
      expect.objectContaining({
        entityType: "columns",
        table: "rental_contract_party_periods",
        name: "masked_document_number_snapshot",
      }),
    );
  });

  it("documents every new enum, table, and generated column in Chinese", async () => {
    const { migration, snapshot } = await readMigrationContaining("rental_tenants");
    const executable = stripSqlComments(migration);

    for (const type of Object.keys(tenancyEnumValues)) {
      expect(readComment(executable, "TYPE", type)).toMatch(/[\u3400-\u9fff]/u);
    }
    for (const table of tenancyTables) {
      expect(readComment(executable, "TABLE", table)).toMatch(/[\u3400-\u9fff]/u);
      const columns = snapshot.ddl
        .filter((entity) => entity.entityType === "columns" && entity.table === table)
        .flatMap((entity) => (entity.name ? [entity.name] : []));

      expect(columns.length).toBeGreaterThan(0);
      for (const column of columns) {
        expect(readColumnComment(executable, table, column)).toMatch(/[\u3400-\u9fff]/u);
      }
    }
  });

  it("adds only idempotent permissions, role grants, hidden routes, and action buttons", async () => {
    const { migration } = await readMigrationContaining("rental_tenants");
    const executable = stripSqlComments(migration);
    const bootstrap = readIncrementalBootstrap(migration);

    for (const permission of tenancyPermissions) {
      expect(bootstrap).toContain(`('${permission}', '${permission}'`);
    }
    expect(bootstrap).toMatch(/"roles"\."key" IN \('owner', 'admin'\)/);
    expect(bootstrap).toMatch(/"roles"\."key" IN \('member', 'viewer'\)/);
    expect(bootstrap).toContain("'rental_tenants:read', 'rental_contracts:read'");
    for (const route of tenancyRoutes) {
      expect(bootstrap).toContain(`'${route}'`);
    }
    for (const permission of tenancyPermissions.filter((key) => !key.endsWith(":read"))) {
      expect(bootstrap).toContain(`'${permission}'`);
    }
    expect(bootstrap).toContain("ON CONFLICT");
    expect(executable).not.toMatch(/\b(?:UPDATE|DELETE FROM) "menus"/);
    expect(executable).not.toContain('INSERT INTO "rental_tenants"');
    expect(executable).not.toContain('INSERT INTO "rental_contracts"');
  });

  it("rehearses DDL, constraints, comments, and repeatable bootstrap in isolated PostgreSQL", async (context) => {
    const databaseUrl = process.env.RENTAL_MIGRATION_TEST_DATABASE_URL;
    if (!databaseUrl) {
      context.skip(
        "RENTAL_MIGRATION_TEST_DATABASE_URL is not configured; skipped disposable PostgreSQL rehearsal",
      );
      return;
    }

    const tenancy = await readMigrationContaining("rental_tenants");
    const rental = await readMigrationContaining("rental_properties");
    const schema = `rental_tenancy_${randomUUID().replaceAll("-", "")}`;
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
            ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001');
          INSERT INTO "ledgers" ("id", "organization_id") VALUES
            ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011');
          INSERT INTO "roles" ("id", "key", "is_system", "organization_id") VALUES
            ('00000000-0000-0000-0000-000000000031', 'owner', TRUE, NULL),
            ('00000000-0000-0000-0000-000000000032', 'admin', TRUE, NULL),
            ('00000000-0000-0000-0000-000000000033', 'member', TRUE, NULL),
            ('00000000-0000-0000-0000-000000000034', 'viewer', TRUE, NULL);
          INSERT INTO "permissions" ("key", "name", "resource", "action", "description")
          VALUES ('dashboard:read', 'dashboard:read', 'dashboard', 'read', 'existing grant');
          INSERT INTO "role_permissions" ("role_id", "permission_id")
          SELECT '00000000-0000-0000-0000-000000000033', "id"
          FROM "permissions" WHERE "key" = 'dashboard:read';
          INSERT INTO "menus" ("organization_id", "type", "name", "is_visible") VALUES
            ('00000000-0000-0000-0000-000000000011', 'directory', '旧组织自定义菜单', TRUE);
        `);

        await sql.unsafe(stripSqlComments(rental.migration));
        await sql.unsafe(`
          INSERT INTO "organizations" ("id", "created_by_user_id") VALUES
            ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001');
          INSERT INTO "menus" ("organization_id", "type", "name", "is_visible") VALUES
            ('00000000-0000-0000-0000-000000000012', 'directory', '新组织自定义菜单', TRUE);
        `);
        await sql.unsafe(stripSqlComments(tenancy.migration));
        await sql.unsafe(readIncrementalBootstrap(tenancy.migration));
        await sql.unsafe(readIncrementalBootstrap(tenancy.migration));

        expect(
          await sql<{ name: string; values: string[] }[]>`
            SELECT "types"."typname" AS "name",
              array_agg("enum_values"."enumlabel" ORDER BY "enum_values"."enumsortorder")::text[] AS "values"
            FROM pg_type AS "types"
            JOIN pg_namespace AS "namespaces" ON "namespaces"."oid" = "types"."typnamespace"
            JOIN pg_enum AS "enum_values" ON "enum_values"."enumtypid" = "types"."oid"
            WHERE "namespaces"."nspname" = ${schema}
              AND "types"."typname" IN ${sql(Object.keys(tenancyEnumValues))}
            GROUP BY "types"."typname"
            ORDER BY "types"."typname"
          `,
        ).toEqual(
          Object.entries(tenancyEnumValues).map(([name, values]) => ({
            name,
            values: [...values],
          })),
        );
        expect(
          await sql`SELECT pg_get_expr(indexprs, indrelid) AS expression,
            pg_get_expr(indpred, indrelid) AS predicate
            FROM pg_index
            WHERE indexrelid = 'rental_tenants_active_document_hash_unique'::regclass`,
        ).toEqual([
          {
            expression: null,
            predicate: "((deleted_at IS NULL) AND (document_number_lookup_hash IS NOT NULL))",
          },
        ]);

        const foreignKeys = await sql<{ definition: string; name: string }[]>`
          SELECT conname AS name, pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
          WHERE contype = 'f' AND conname IN (
            'rental_contract_changes_contract_scope_fk',
            'rental_contract_deposit_terms_contract_scope_fk',
            'rental_contract_party_periods_contract_scope_fk',
            'rental_contract_party_periods_tenant_scope_fk',
            'rental_contract_spaces_contract_scope_fk',
            'rental_contract_spaces_space_scope_fk',
            'rental_contracts_property_scope_fk',
            'rental_contracts_renewed_from_scope_fk'
          )
          ORDER BY conname
        `;
        expect(foreignKeys).toEqual([
          {
            name: "rental_contract_changes_contract_scope_fk",
            definition:
              "FOREIGN KEY (organization_id, contract_id) REFERENCES rental_contracts(organization_id, id)",
          },
          {
            name: "rental_contract_deposit_terms_contract_scope_fk",
            definition:
              "FOREIGN KEY (organization_id, contract_id) REFERENCES rental_contracts(organization_id, id)",
          },
          {
            name: "rental_contract_party_periods_contract_scope_fk",
            definition:
              "FOREIGN KEY (organization_id, contract_id) REFERENCES rental_contracts(organization_id, id)",
          },
          {
            name: "rental_contract_party_periods_tenant_scope_fk",
            definition:
              "FOREIGN KEY (organization_id, tenant_id) REFERENCES rental_tenants(organization_id, id)",
          },
          {
            name: "rental_contract_spaces_contract_scope_fk",
            definition:
              "FOREIGN KEY (organization_id, contract_id, property_id) REFERENCES rental_contracts(organization_id, id, property_id)",
          },
          {
            name: "rental_contract_spaces_space_scope_fk",
            definition:
              "FOREIGN KEY (organization_id, property_id, space_id) REFERENCES rental_spaces(organization_id, property_id, id)",
          },
          {
            name: "rental_contracts_property_scope_fk",
            definition:
              "FOREIGN KEY (organization_id, property_id) REFERENCES rental_properties(organization_id, id)",
          },
          {
            name: "rental_contracts_renewed_from_scope_fk",
            definition:
              "FOREIGN KEY (organization_id, property_id, renewed_from_contract_id) REFERENCES rental_contracts(organization_id, property_id, id)",
          },
        ]);

        const enumComments = await sql<{ comment: string | null; name: string }[]>`
          SELECT "types"."typname" AS "name",
            obj_description("types"."oid", 'pg_type') AS "comment"
          FROM pg_type AS "types"
          JOIN pg_namespace AS "namespaces" ON "namespaces"."oid" = "types"."typnamespace"
          WHERE "namespaces"."nspname" = ${schema}
            AND "types"."typname" IN ${sql(Object.keys(tenancyEnumValues))}
          ORDER BY "types"."typname"
        `;
        expect(enumComments.map(({ name }) => name)).toEqual(Object.keys(tenancyEnumValues));
        expect(enumComments.every(({ comment }) => /[\u3400-\u9fff]/u.test(comment ?? ""))).toBe(
          true,
        );

        const tableComments = await sql<{ comment: string | null; name: string }[]>`
          SELECT "tables"."relname" AS "name",
            obj_description("tables"."oid", 'pg_class') AS "comment"
          FROM pg_class AS "tables"
          JOIN pg_namespace AS "namespaces" ON "namespaces"."oid" = "tables"."relnamespace"
          WHERE "namespaces"."nspname" = ${schema}
            AND "tables"."relkind" = 'r'
            AND "tables"."relname" IN ${sql(tenancyTables)}
          ORDER BY "tables"."relname"
        `;
        expect(tableComments.map(({ name }) => name)).toEqual([...tenancyTables].sort());
        expect(tableComments.every(({ comment }) => /[\u3400-\u9fff]/u.test(comment ?? ""))).toBe(
          true,
        );

        const columnComments = await sql<
          { column: string; comment: string | null; table: string }[]
        >`
          SELECT "tables"."relname" AS "table", "columns"."attname" AS "column",
            col_description("tables"."oid", "columns"."attnum") AS "comment"
          FROM pg_class AS "tables"
          JOIN pg_namespace AS "namespaces" ON "namespaces"."oid" = "tables"."relnamespace"
          JOIN pg_attribute AS "columns" ON "columns"."attrelid" = "tables"."oid"
          WHERE "namespaces"."nspname" = ${schema}
            AND "tables"."relname" IN ${sql(tenancyTables)}
            AND "columns"."attnum" > 0
            AND NOT "columns"."attisdropped"
          ORDER BY "tables"."relname", "columns"."attname"
        `;
        const expectedColumnTargets = Object.entries(tenancyColumns)
          .flatMap(([table, columns]) => columns.map((column) => `${table}.${column}`))
          .sort();
        expect(columnComments.map(({ column, table }) => `${table}.${column}`)).toEqual(
          expectedColumnTargets,
        );
        expect(columnComments.every(({ comment }) => /[\u3400-\u9fff]/u.test(comment ?? ""))).toBe(
          true,
        );

        expect(
          await sql`SELECT count(*)::int AS count FROM "permissions"
            WHERE "key" IN ${sql(tenancyPermissions)}`,
        ).toEqual([{ count: 9 }]);
        expect(
          await sql`
            SELECT "roles"."key", count("permissions"."id")::int AS count
            FROM "roles"
            LEFT JOIN "role_permissions" ON "role_permissions"."role_id" = "roles"."id"
            LEFT JOIN "permissions" ON "permissions"."id" = "role_permissions"."permission_id"
              AND "permissions"."key" IN ${sql(tenancyPermissions)}
            WHERE "roles"."key" IN ('owner', 'admin', 'member', 'viewer')
            GROUP BY "roles"."key"
            ORDER BY "roles"."key"
          `,
        ).toEqual([
          { key: "admin", count: 9 },
          { key: "member", count: 2 },
          { key: "owner", count: 9 },
          { key: "viewer", count: 2 },
        ]);
        expect(
          await sql`SELECT count(*)::int AS count
            FROM "role_permissions"
            JOIN "permissions" ON "permissions"."id" = "role_permissions"."permission_id"
            WHERE "role_permissions"."role_id" = '00000000-0000-0000-0000-000000000033'
              AND "permissions"."key" = 'dashboard:read'`,
        ).toEqual([{ count: 1 }]);

        expect(
          await sql`
            SELECT "organization_id", count(*)::int AS count
            FROM "menus"
            WHERE "route_key" IN ${sql(tenancyRoutes)}
              OR "permission_code" IN (
                'rental_tenants:create', 'rental_tenants:update', 'rental_tenants:delete',
                'rental_tenants:sensitive_read', 'rental_contracts:create',
                'rental_contracts:update', 'rental_contracts:delete'
              )
            GROUP BY "organization_id"
            ORDER BY "organization_id"
          `,
        ).toEqual([
          { organization_id: "00000000-0000-0000-0000-000000000011", count: 12 },
          { organization_id: "00000000-0000-0000-0000-000000000012", count: 12 },
        ]);
        expect(
          await sql`SELECT count(*)::int AS count FROM "menus"
            WHERE "name" IN ('旧组织自定义菜单', '新组织自定义菜单')`,
        ).toEqual([{ count: 2 }]);
        expect(
          await sql`SELECT "organization_id", count(*)::int AS count FROM "menus"
            WHERE "route_key" = 'RentalProperties' GROUP BY "organization_id"`,
        ).toEqual([{ organization_id: "00000000-0000-0000-0000-000000000011", count: 1 }]);

        const organizationId = "00000000-0000-0000-0000-000000000011";
        const otherOrganizationId = "00000000-0000-0000-0000-000000000012";
        const userId = "00000000-0000-0000-0000-000000000001";
        const propertyId = "00000000-0000-0000-0000-000000000041";
        await sql`
          INSERT INTO "rental_properties" (
            "id", "organization_id", "ledger_id", "name", "type", "country_code",
            "address_line", "created_by_user_id", "updated_by_user_id"
          ) VALUES (
            ${propertyId}, ${organizationId}, '00000000-0000-0000-0000-000000000021',
            '迁移测试房产', 'residential_unit', 'CN', '测试地址', ${userId}, ${userId}
          )
        `;
        await sql`
          INSERT INTO "rental_tenants" (
            "id", "organization_id", "type", "name", "document_country_code",
            "document_type", "document_number_lookup_hash", "masked_document_number",
            "sensitive_identity_ciphertext",
            "sensitive_identity_key_version", "created_by_user_id", "updated_by_user_id"
          ) VALUES (
            '00000000-0000-0000-0000-000000000051', ${organizationId}, 'individual', '租户甲',
            'CN', 'national_id', 'same-hash', '1101********1234', decode('00', 'hex'), 1,
            ${userId}, ${userId}
          )
        `;
        await sql`
          INSERT INTO "rental_tenants" (
            "id", "organization_id", "type", "name", "created_by_user_id", "updated_by_user_id"
          ) VALUES (
            '00000000-0000-0000-0000-000000000052', ${organizationId}, 'individual', '无敏感身份租户',
            ${userId}, ${userId}
          )
        `;
        await sql`
          INSERT INTO "rental_contracts" (
            "id", "organization_id", "property_id", "contract_number", "status",
            "start_date", "end_date", "rent_amount_minor", "billing_anchor",
            "payment_interval_months", "due_days_before", "created_by_user_id", "updated_by_user_id"
          ) VALUES (
            '00000000-0000-0000-0000-000000000061', ${organizationId}, ${propertyId},
            'RC-2026-000002', 'confirmed', '2026-01-01', '2026-12-31', 100000,
            'contract_start', 1, 5, ${userId}, ${userId}
          )
        `;
        await sql`
          INSERT INTO "rental_contract_party_periods" (
            "id", "organization_id", "contract_id", "tenant_id", "valid_from", "valid_to",
            "is_primary_payer", "tenant_type_snapshot", "tenant_name_snapshot"
          ) VALUES (
            '00000000-0000-0000-0000-000000000071', ${organizationId},
            '00000000-0000-0000-0000-000000000061',
            '00000000-0000-0000-0000-000000000052', '2026-01-01', '2026-12-31', TRUE,
            'individual', '无敏感身份租户'
          )
        `;
        expect(
          await sql`
            SELECT "tenant_type_snapshot", "tenant_name_snapshot",
              "identity_snapshot_ciphertext", "identity_snapshot_key_version"
            FROM "rental_contract_party_periods"
            WHERE "id" = '00000000-0000-0000-0000-000000000071'
          `,
        ).toEqual([
          {
            tenant_type_snapshot: "individual",
            tenant_name_snapshot: "无敏感身份租户",
            identity_snapshot_ciphertext: null,
            identity_snapshot_key_version: null,
          },
        ]);
        await expect(
          sql.savepoint(
            async (savepoint) => savepoint`
              INSERT INTO "rental_tenants" (
                "organization_id", "type", "name", "document_country_code", "document_type",
                "document_number_lookup_hash", "masked_document_number", "sensitive_identity_ciphertext",
                "sensitive_identity_key_version", "created_by_user_id", "updated_by_user_id"
              ) VALUES (
                ${organizationId}, 'individual', '重复证件租户', 'CN', 'national_id', 'same-hash',
                '1101********1234', decode('01', 'hex'), 1, ${userId}, ${userId}
              )
            `,
          ),
        ).rejects.toMatchObject({
          code: "23505",
          constraint: "rental_tenants_active_document_hash_unique",
        });
        await expect(
          sql.savepoint(
            async (savepoint) => savepoint`
              INSERT INTO "rental_contracts" (
                "organization_id", "property_id", "contract_number",
                "created_by_user_id", "updated_by_user_id"
              ) VALUES (${otherOrganizationId}, ${propertyId}, 'RC-2026-000001', ${userId}, ${userId})
            `,
          ),
        ).rejects.toMatchObject({
          code: "23503",
          constraint: "rental_contracts_property_scope_fk",
        });
      });
    } finally {
      await client.unsafe(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
      await client.end({ timeout: 5 });
    }
  });
});
