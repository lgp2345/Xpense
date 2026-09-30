import { readdir, readFile } from "node:fs/promises";

import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "./schema.js";

const entities = schema as unknown as Record<string, unknown>;
const dialect = new PgDialect();

function table(name: string) {
  const value = entities[name];
  expect(value, `missing schema export ${name}`).toBeDefined();
  return getTableConfig(value as never);
}

function checkSql(tableName: string, checkName: string): string {
  const check = table(tableName).checks.find((entry) => entry.name === checkName);
  expect(check, `missing ${checkName}`).toBeDefined();
  if (!check) throw new Error(`missing ${checkName}`);
  return dialect.sqlToQuery(check.value).sql.toLowerCase();
}

function hasUniqueTarget(target: unknown, columns: string[]): boolean {
  const config = getTableConfig(target as never);
  const requested = [...columns].sort();
  const groups = [
    ...config.primaryKeys.map(({ columns: keyColumns }) => keyColumns.map(({ name }) => name)),
    ...config.uniqueConstraints.map(({ columns: keyColumns }) =>
      keyColumns.map(({ name }) => name),
    ),
    ...config.indexes
      .filter(({ config: index }) => index.unique && !index.where)
      .map(({ config: index }) =>
        index.columns.map((column) =>
          typeof column === "object" &&
          column !== null &&
          "name" in column &&
          typeof column.name === "string"
            ? column.name
            : null,
        ),
      )
      .filter((names): names is string[] => names.every((name): name is string => name !== null)),
  ];
  return groups.some(
    (group) =>
      group.length === requested.length &&
      [...group].sort().every((column, index) => column === requested[index]),
  );
}

describe("租赁月度财务数据库契约", () => {
  it("导出独立收费、读数、收退款、结算和幂等表", () => {
    expect(
      [
        "rentalChargeTerms",
        "rentalChargeTermRevisions",
        "rentalMeterReadings",
        "rentalMeterReadingRevisions",
        "rentalBillMeterIntervals",
        "rentalBillRevisions",
        "rentalCashEntries",
        "rentalSettlements",
        "rentalSettlementRevisions",
        "rentalSettlementBills",
        "rentalFinanceRequests",
      ].map((name) => table(name).name),
    ).toEqual([
      "rental_charge_terms",
      "rental_charge_term_revisions",
      "rental_meter_readings",
      "rental_meter_reading_revisions",
      "rental_bill_meter_intervals",
      "rental_bill_revisions",
      "rental_cash_entries",
      "rental_settlements",
      "rental_settlement_revisions",
      "rental_settlement_bills",
      "rental_finance_requests",
    ]);
  });

  it("账单保留模型版本、月份、修订、费用快照和真实行 ID", () => {
    expect(table("rentalBills").columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["model_version", "billing_month", "revision"]),
    );
    expect(table("rentalBillLines").columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["note", "fee_snapshot"]),
    );
    const unique = table("rentalBills").indexes.find(
      (item) => item.config.name === "rental_bills_monthly_current_unique",
    );
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.where).toBeDefined();
  });

  it("收费和资金使用合同作用域复合引用，现金目标与撤销字段明确约束", () => {
    expect(table("rentalChargeTerms").foreignKeys.map((key) => key.getName())).toContain(
      "rental_charge_terms_contract_scope_fk",
    );
    expect(table("rentalCashEntries").foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "rental_cash_entries_contract_scope_fk",
        "rental_cash_entries_bill_scope_fk",
        "rental_cash_entries_settlement_scope_fk",
      ]),
    );
    expect(checkSql("rentalCashEntries", "rental_cash_entries_target_check")).toContain("is null");
    expect(checkSql("rentalCashEntries", "rental_cash_entries_revoke_check")).toContain(
      '"revoke_reason" is not null',
    );
    expect(checkSql("rentalCashEntries", "rental_cash_entries_amount_check")).toContain(
      "between 1 and 9007199254740991",
    );
  });

  it("每个合同作用域外键都指向完整的非部分唯一目标列组", () => {
    const scopedForeignKeys = [
      "rentalChargeTerms",
      "rentalChargeTermRevisions",
      "rentalMeterReadings",
      "rentalMeterReadingRevisions",
      "rentalBillMeterIntervals",
      "rentalBillRevisions",
      "rentalCashEntries",
      "rentalFinanceRequests",
      "rentalSettlements",
      "rentalSettlementRevisions",
      "rentalSettlementBills",
    ].flatMap((name) =>
      table(name)
        .foreignKeys.filter((foreignKey) => foreignKey.getName().includes("_scope_fk"))
        .map((foreignKey) => ({ name: foreignKey.getName(), reference: foreignKey.reference() })),
    );

    expect(scopedForeignKeys.length).toBeGreaterThan(0);
    for (const { name, reference } of scopedForeignKeys) {
      expect(
        hasUniqueTarget(
          reference.foreignTable,
          reference.foreignColumns.map(({ name }) => name),
        ),
        `${name} references a column group without a full, non-partial unique target`,
      ).toBe(true);
    }
  });

  it("读数区间由账单行类别和终值前驱复合外键证明，押金有效收款仅一条", () => {
    expect(table("rentalBillMeterIntervals").foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "rental_bill_meter_intervals_line_scope_kind_fk",
        "rental_bill_meter_intervals_start_reading_scope_kind_fk",
        "rental_bill_meter_intervals_end_predecessor_scope_fk",
      ]),
    );
    const depositReceipt = table("rentalCashEntries").indexes.find(
      (item) => item.config.name === "rental_cash_entries_active_deposit_receipt_unique",
    );
    expect(depositReceipt?.config.unique).toBe(true);
    expect(depositReceipt?.config.where).toBeDefined();
    expect(table("rentalFinanceRequests").uniqueConstraints.map((key) => key.name)).toContain(
      "rental_finance_requests_request_unique",
    );
  });

  it("生成迁移只建结构，不写历史数据或在索引中转换 enum", async () => {
    const migrations = new URL("./migrations/", import.meta.url);
    const entries = await readdir(migrations);
    const name = entries.find((entry) => entry.endsWith("_rental_monthly_finance"));
    expect(name).toBeDefined();
    const sqlText = await readFile(new URL(`${name}/migration.sql`, migrations), "utf8");
    expect(sqlText).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM)\b/i);
    expect(sqlText).toContain(
      'CONSTRAINT "rental_meter_readings_scope_id_unique" UNIQUE("organization_id","contract_id","id")',
    );
    expect(sqlText).toContain(
      'FOREIGN KEY ("organization_id","contract_id","reading_id") REFERENCES "rental_meter_readings"("organization_id","contract_id","id")',
    );
    expect(sqlText).toMatch(/"kind"::text\s+IN\s*\('termination_adjustment',\s*'extra_fee'\)/i);
    expect(sqlText).toMatch(/"type"::text\s*=\s*'monthly'/i);
    expect(sqlText).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX[^;]*::text/is);
    expect(sqlText).not.toMatch(
      /DEFAULT\s+'(?:monthly|water|electricity|extra_fee|termination_adjustment)'/i,
    );
  });

  it("真实 PostgreSQL runner 演练明确留到 Task 10", (context) => {
    if (process.env.RENTAL_MIGRATION_TEST_DATABASE_URL) {
      context.skip("Task 3 未获准执行真实 DDL；完整 runner 与并发演练留待 Task 10");
      return;
    }
    context.skip("专用迁移库未配置；完整 runner 与并发演练留待 Task 10");
  });
});
