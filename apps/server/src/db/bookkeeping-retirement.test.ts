import { readFileSync } from "node:fs";

import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "./schema.js";

const migrationUrl = new URL("./migrations/20261026055429_remove_bookkeeping/", import.meta.url);
const migration = readFileSync(new URL("migration.sql", migrationUrl), "utf8");

describe("记账数据结构移除", () => {
  it("不再导出独立记账表与枚举", () => {
    for (const name of [
      "ledgers",
      "accounts",
      "categories",
      "transactions",
      "accountMovements",
      "ledgerType",
      "accountType",
      "categoryType",
      "transactionType",
    ]) {
      expect(Object.keys(schema)).not.toContain(name);
    }
  });

  it("房产直接归属组织，不再要求伴生账本", () => {
    const config = getTableConfig(schema.rentalProperties);
    expect(config.columns.map((column) => column.name)).not.toContain("ledger_id");
    expect(
      config.foreignKeys.map((key) => getTableName(key.reference().foreignTable)),
    ).not.toContain("ledgers");
    expect(config.columns.find((column) => column.name === "organization_id")?.notNull).toBe(true);
  });

  it("迁移只删除独立记账表，先解除房产外键且不级联删除租赁数据", () => {
    const droppedTables = [...migration.matchAll(/DROP TABLE "([^"]+)"/g)].map((match) => match[1]);
    expect(droppedTables.sort()).toEqual([
      "account_movements",
      "accounts",
      "categories",
      "ledgers",
      "transactions",
    ]);
    expect(migration).not.toMatch(/\bCASCADE\b/);
    expect(
      migration.indexOf('DROP CONSTRAINT "rental_properties_organization_ledger_fk"'),
    ).toBeLessThan(migration.indexOf('DROP TABLE "ledgers"'));
    const snapshot = JSON.parse(readFileSync(new URL("snapshot.json", migrationUrl), "utf8")) as {
      ddl: Array<{ entityType: string; name: string; table?: string }>;
    };
    const tableNames = snapshot.ddl
      .filter((item) => item.entityType === "tables")
      .map((item) => item.name);
    for (const name of droppedTables) expect(tableNames).not.toContain(name);
    expect(tableNames).toEqual(
      expect.arrayContaining(["rental_properties", "rental_contracts", "rental_cash_entries"]),
    );
  });

  it("清理已有菜单和角色权限后再删除旧权限定义", () => {
    const menuDelete = migration.indexOf('DELETE FROM "menus"');
    const roleDelete = migration.indexOf('DELETE FROM "role_permissions"');
    const permissionDelete = migration.indexOf('DELETE FROM "permissions"');
    expect(menuDelete).toBeGreaterThanOrEqual(0);
    expect(roleDelete).toBeGreaterThan(menuDelete);
    expect(permissionDelete).toBeGreaterThan(roleDelete);
  });
});
