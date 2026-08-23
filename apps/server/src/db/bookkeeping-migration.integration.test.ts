import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  bookkeepingPermissions,
  bookkeepingTables,
  bookkeepingTypes,
  commentedColumns,
  countNormalizedSqlFragment,
  defaultCategoryTuples,
  normalizeSql,
  stripSqlComments,
} from "./bookkeeping-migration-test-helpers.js";

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

type BookkeepingMigrationArtifact = {
  directoryName: string;
  migration: string;
  snapshot: MigrationSnapshot;
};

const ledgerCanonicalSql = `
  deterministic_ledger_id := md5(
    'xpense:bookkeeping-default:v1:organization:'
    || organization_row."id"::text
    || ':ledger:personal'
  )::uuid;
`;

const accountCanonicalSql = `
  default_account_id := md5(
    'xpense:bookkeeping-default:v1:organization:'
    || organization_row."id"::text
    || ':account:cash'
  )::uuid;
`;

const categoryCanonicalSql = `
  default_category_id := md5(
    'xpense:bookkeeping-default:v1:organization:'
    || organization_row."id"::text
    || ':ledger:'
    || default_ledger_id::text
    || ':category:'
    || category_row.category_type
    || ':'
    || category_row.category_key
  )::uuid;
`;

/** 定位同时创建全部五张记账表的唯一 migration，避免依赖时间戳目录名或未来累计 snapshot。 */
async function readBookkeepingMigration(): Promise<BookkeepingMigrationArtifact> {
  const migrationsUrl = new URL("./migrations/", import.meta.url);
  const entries = await readdir(migrationsUrl, { withFileTypes: true });
  const candidates: BookkeepingMigrationArtifact[] = [];

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
    if (bookkeepingTables.every((table) => executableSql.includes(`CREATE TABLE "${table}"`))) {
      candidates.push({
        directoryName: entry.name,
        migration,
        snapshot: JSON.parse(snapshotSource) as MigrationSnapshot,
      });
    }
  }

  if (candidates.length !== 1) {
    throw new Error(`Expected one bookkeeping migration, found ${candidates.length}`);
  }

  return candidates[0] as BookkeepingMigrationArtifact;
}

describe("bookkeeping migration contract", () => {
  it("ignores SQL hidden in line and block comments", () => {
    const mutatedSql = `
      -- INSERT INTO "permissions" ("key") VALUES ('accounts:read');
      /*
      DO $$ BEGIN
        INSERT INTO "categories" ("name") VALUES ('餐饮');
        VALUES ('expense', 'dining', '餐饮', 0);
      END $$;
      */
      VALUES ('expense', 'dining', '餐饮', 99);
      SELECT 1;
    `;

    const executableSql = stripSqlComments(mutatedSql);

    expect(mutatedSql).toContain('INSERT INTO "permissions"');
    expect(countNormalizedSqlFragment(mutatedSql, "('expense', 'dining', '餐饮', 0)")).toBe(1);
    expect(executableSql).toContain("SELECT 1;");
    expect(executableSql).not.toContain('INSERT INTO "permissions"');
    expect(executableSql).not.toContain('INSERT INTO "categories"');
    expect(
      countNormalizedSqlFragment(
        `${executableSql} ('expense', 'dining', '餐饮', 99)`,
        "('expense', 'dining', '餐饮', 0)",
      ),
    ).toBe(0);
  });

  it("contains the generated tables, enums, organization columns, constraints and indexes", async () => {
    const { migration, snapshot } = await readBookkeepingMigration();
    const executableSql = stripSqlComments(migration);

    expect(snapshot.version).toBe("8");
    expect(snapshot.dialect).toBe("postgres");
    for (const table of bookkeepingTables) {
      expect(snapshot.ddl).toContainEqual(
        expect.objectContaining({ entityType: "tables", name: table }),
      );
    }
    for (const type of bookkeepingTypes) {
      expect(snapshot.ddl).toContainEqual(
        expect.objectContaining({ entityType: "enums", name: type }),
      );
    }
    for (const [table, columns] of Object.entries(commentedColumns)) {
      for (const column of columns) {
        expect(snapshot.ddl).toContainEqual(
          expect.objectContaining({ entityType: "columns", table, name: column }),
        );
      }
    }

    for (const name of [
      "ledgers_organization_active_default_unique",
      "categories_active_root_name_unique",
      "categories_active_child_name_unique",
      "categories_parent_scope_fk",
      "transactions_category_scope_fk",
      "account_movements_organization_transaction_fk",
      "account_movements_organization_account_fk",
      "transaction_amount_minor_positive_check",
      "account_movements_amount_minor_nonzero_check",
    ]) {
      expect(executableSql).toContain(`"${name}"`);
    }
  });

  it("comments every new table, enum and column exactly once", async () => {
    const { migration } = await readBookkeepingMigration();
    const executableSql = stripSqlComments(migration);

    for (const table of bookkeepingTables) {
      expect(executableSql.match(new RegExp(`COMMENT ON TABLE "${table}"`, "g"))).toHaveLength(1);
    }
    for (const type of bookkeepingTypes) {
      expect(executableSql.match(new RegExp(`COMMENT ON TYPE "${type}"`, "g"))).toHaveLength(1);
    }
    for (const [table, columns] of Object.entries(commentedColumns)) {
      for (const column of columns) {
        expect(
          executableSql.match(new RegExp(`COMMENT ON COLUMN "${table}"\\."${column}"`, "g")),
        ).toHaveLength(1);
      }
    }

    expect(executableSql.match(/COMMENT ON TABLE/g)).toHaveLength(5);
    expect(executableSql.match(/COMMENT ON TYPE/g)).toHaveLength(4);
    expect(executableSql.match(/COMMENT ON COLUMN/g)).toHaveLength(60);
    expect(executableSql).toContain(
      `COMMENT ON COLUMN "transactions"."amount_minor" IS '交易金额绝对值，单位为组织基础币种的最小货币单位';`,
    );
    expect(executableSql).toContain(
      `COMMENT ON COLUMN "account_movements"."amount_minor" IS '有符号账户变动金额，单位为组织基础币种的最小货币单位；正数增加余额，负数减少余额';`,
    );
  });

  it("initializes deterministic defaults with legacy-name compatibility", async () => {
    const { migration } = await readBookkeepingMigration();
    const executableSql = stripSqlComments(migration);

    for (const canonicalSql of [ledgerCanonicalSql, accountCanonicalSql, categoryCanonicalSql]) {
      expect(countNormalizedSqlFragment(executableSql, canonicalSql)).toBe(1);
    }
    for (const categoryTuple of defaultCategoryTuples) {
      expect(countNormalizedSqlFragment(executableSql, categoryTuple)).toBe(1);
    }
    expect(executableSql).toContain("'个人账本'");
    expect(executableSql).toContain("'现金'");
    expect(executableSql).toMatch(
      /"accounts"[\s\S]*\("id" = default_account_id OR "name" = '现金'\)/,
    );
    expect(executableSql).toMatch(
      /"categories"[\s\S]*"type" = category_row\.category_type::"category_type"[\s\S]*"parent_id" IS NULL[\s\S]*\("id" = default_category_id OR "name" = category_row\.category_name\)/,
    );
  });

  it("inserts bookkeeping permissions before an additive organization menu tree", async () => {
    const { migration } = await readBookkeepingMigration();
    const executableSql = stripSqlComments(migration);
    const normalizedSql = normalizeSql(executableSql);

    for (const permission of bookkeepingPermissions) {
      expect(countNormalizedSqlFragment(executableSql, `('${permission}', '${permission}'`)).toBe(
        1,
      );
    }
    for (const routeKey of ["Transactions", "Accounts", "Categories"]) {
      expect(executableSql).toContain(`'${routeKey}'`);
    }
    for (const icon of ["ReceiptText", "WalletCards", "Shapes"]) {
      expect(executableSql).toContain(`'${icon}'`);
    }
    const permissionInsert = normalizeSql(
      'INSERT INTO "permissions" ("key", "name", "resource", "action", "description")',
    );
    const defaultsDo = normalizeSql(`
      DO $$
      DECLARE
        organization_row record;
        category_row record;
        default_ledger_id uuid;
    `);
    const menuDo = normalizeSql(`
      DO $$
      DECLARE
        organization_row record;
        menu_row record;
        button_row record;
    `);
    const permissionIndex = normalizedSql.indexOf(permissionInsert);
    const defaultsIndex = normalizedSql.indexOf(defaultsDo);
    const menuIndex = normalizedSql.indexOf(menuDo);

    expect(permissionIndex).toBeGreaterThanOrEqual(0);
    expect(defaultsIndex).toBeGreaterThan(permissionIndex);
    expect(menuIndex).toBeGreaterThan(defaultsIndex);
    expect(countNormalizedSqlFragment(executableSql, permissionInsert)).toBe(1);
    expect(countNormalizedSqlFragment(executableSql, defaultsDo)).toBe(1);
    expect(countNormalizedSqlFragment(executableSql, menuDo)).toBe(1);
    expect(executableSql).toContain("AND \"name\" = '记账管理'");
    expect(executableSql).toContain(
      "('Transactions', '交易记录', 'ReceiptText', 'transactions:read', 0)",
    );
    expect(executableSql).toContain("('Accounts', '账户管理', 'WalletCards', 'accounts:read', 10)");
    expect(executableSql).toContain("('Categories', '分类管理', 'Shapes', 'categories:read', 20)");
    for (const button of [
      "('Transactions', '新增交易', 'transactions:create', 100)",
      "('Transactions', '编辑交易', 'transactions:update', 110)",
      "('Transactions', '删除交易', 'transactions:delete', 120)",
      "('Accounts', '新增账户', 'accounts:create', 100)",
      "('Accounts', '编辑账户', 'accounts:update', 110)",
      "('Accounts', '删除账户', 'accounts:delete', 120)",
      "('Categories', '新增分类', 'categories:create', 100)",
      "('Categories', '编辑分类', 'categories:update', 110)",
      "('Categories', '删除分类', 'categories:delete', 120)",
    ]) {
      expect(executableSql).toContain(button);
    }
    expect(executableSql).not.toContain('INSERT INTO "role_permissions"');
    expect(executableSql).not.toContain('UPDATE "menus"');
    expect(executableSql).not.toContain('DELETE FROM "menus"');
    expect(executableSql).not.toMatch(/\b(?:DROP|TRUNCATE)\b/i);
  });

  it("binds the contract to the generated migration that owns bookkeeping DDL", async () => {
    const { directoryName } = await readBookkeepingMigration();

    expect(directoryName).toMatch(/^\d{14}_[a-z0-9_]+$/);
  });
});
