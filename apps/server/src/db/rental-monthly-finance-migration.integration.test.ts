import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { insertRentalPostgresFixture } from "../test/rental-postgres-fixtures.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";

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

  it("增量权限迁移只为既有系统 owner/admin 增权，不修改组织角色或菜单", async () => {
    const migrations = new URL("./migrations/", import.meta.url);
    const entries = await readdir(migrations);
    const name = entries.find((entry) => entry.endsWith("_rental_monthly_permissions"));
    expect(name).toBeDefined();
    if (!name) throw new Error("missing rental monthly permissions migration");

    const sqlText = await readFile(new URL(`${name}/migration.sql`, migrations), "utf8");
    const permissionKeys = [
      "rental_charges:read",
      "rental_charges:update",
      "rental_meters:read",
      "rental_meters:update",
      "rental_monthly_bills:generate",
      "rental_monthly_bills:adjust",
      "rental_receipts:create",
      "rental_receipts:revoke",
      "rental_refunds:create",
      "rental_refunds:revoke",
      "rental_settlements:read",
      "rental_settlements:confirm",
    ];

    expect(sqlText).toMatch(/INSERT\s+INTO\s+"permissions"/i);
    expect(sqlText).toMatch(/ON\s+CONFLICT\s*\("key"\)\s*DO\s+NOTHING/i);
    for (const key of permissionKeys) {
      const [resource, action] = key.split(":");
      expect(sqlText).toContain(`('${key}', '${key}', '${resource}', '${action}', '${key}')`);
    }
    const rolePermissionSql = sqlText.slice(sqlText.indexOf('INSERT INTO "role_permissions"'));
    expect(rolePermissionSql).toMatch(/INSERT\s+INTO\s+"role_permissions"[\s\S]*?SELECT/i);
    expect(rolePermissionSql).toMatch(/r\."is_system"\s*=\s*TRUE/i);
    expect(rolePermissionSql).toMatch(/r\."organization_id"\s+IS\s+NULL/i);
    expect(rolePermissionSql).toMatch(/r\."key"\s+IN\s*\('owner',\s*'admin'\)/i);
    for (const key of permissionKeys) {
      expect(rolePermissionSql).toContain(`'${key}'`);
    }
    expect(sqlText).toMatch(/ON\s+CONFLICT\s+DO\s+NOTHING/i);
    expect(sqlText).not.toMatch(/INSERT\s+INTO\s+"menus"/i);
    expect(sqlText).not.toMatch(
      /\b(?:UPDATE|DELETE\s+FROM)\s+"?(?:roles|role_permissions|menus)\b/i,
    );
  });

  const url = rentalTestDatabaseUrl(process.env);
  it.skipIf(!url)(
    "空 schema 使用真实 runner 一次应用14段，重复运行不重复提交",
    async () => {
      if (!url) throw new Error("专用库和 DDL 许可缺失");
      await withRentalPostgres(url, async (pg) => {
        const corpus = await pg.applyMigrations();
        const history =
          await pg.client`SELECT name, hash, created_at FROM __drizzle_migrations ORDER BY name`;
        expect(history.map((row) => row.name)).toEqual(corpus.entries.map((entry) => entry.name));
        expect(history.map((row) => row.hash)).toEqual(
          corpus.entries.map((entry) => entry.copiedHash),
        );
        await pg.applyMigrations();
        expect(
          await pg.client`SELECT name, hash, created_at FROM __drizzle_migrations ORDER BY name`,
        ).toEqual(history);
        const fixture = await insertRentalPostgresFixture(pg.db);
        const bills = await pg.db.select().from(schema.rentalBills);
        expect(bills).toHaveLength(3);
        expect(bills.every((bill) => bill.modelVersion === 2)).toBe(true);
        const bill = bills.find((item) => item.id === fixture.ids.january);
        if (!bill) throw new Error("真实账单缺失");
        await expect(
          pg.db.transaction((tx) =>
            tx
              .update(schema.rentalBills)
              .set({ amountMinor: -1 })
              .where(eq(schema.rentalBills.id, bill.id)),
          ),
        ).rejects.toThrow();
        await expect(
          pg.db.transaction((tx) =>
            tx.insert(schema.rentalCashEntries).values({
              ...fixture.scope,
              kind: "receipt",
              purpose: "bill_receipt",
              billId: randomUUID(),
              amountMinor: 1,
              occurredOn: "2026-01-01",
              createdByUserId: fixture.userId,
            }),
          ),
        ).rejects.toThrow();
        await expect(
          pg.db.transaction((tx) =>
            tx.insert(schema.rentalCashEntries).values({
              ...fixture.scope,
              kind: "refund",
              purpose: "refund",
              billId: bill.id,
              amountMinor: 0,
              occurredOn: "2026-01-01",
              createdByUserId: fixture.userId,
            }),
          ),
        ).rejects.toThrow();
        const intervals = await pg.db.select().from(schema.rentalBillMeterIntervals);
        const interval = intervals[0];
        if (!interval) throw new Error("真实区间缺失");
        await expect(
          pg.db.transaction((tx) =>
            tx
              .update(schema.rentalMeterReadings)
              .set({ predecessorId: null })
              .where(eq(schema.rentalMeterReadings.id, interval.endReadingId)),
          ),
        ).rejects.toThrow();
        expect(await pg.db.select().from(schema.rentalCashEntries)).toHaveLength(0);
        expect(await pg.db.select().from(schema.rentalBills)).toEqual(bills);
        expect(await pg.db.select().from(schema.rentalBillMeterIntervals)).toEqual(intervals);
      });
    },
    120000,
  );

  it.skipIf(!url)(
    "旧11段提交后枚举/财务/权限一起升级，保留v1和自定义授权菜单",
    async () => {
      if (!url) throw new Error("专用库和 DDL 许可缺失");
      await withRentalPostgres(url, async (pg) => {
        const prefix = await pg.applyMigrations(true);
        expect(prefix.entries).toHaveLength(11);
        const fixture = await insertRentalPostgresFixture(pg.db, true);
        const oldBills =
          await pg.client`SELECT id, source_key, amount_minor, snapshot FROM rental_bills ORDER BY id`;
        const oldLines =
          await pg.client`SELECT id, bill_id, amount_minor, kind::text FROM rental_bill_lines ORDER BY id`;
        const ownerId = randomUUID();
        const adminId = randomUUID();
        const viewerId = randomUUID();
        const customId = randomUUID();
        await pg.db.insert(schema.roles).values([
          { id: ownerId, key: "owner", name: "系统房东", isSystem: true },
          { id: adminId, key: "admin", name: "系统管理", isSystem: true },
          { id: viewerId, key: "viewer", name: "系统只读", isSystem: true },
          {
            id: customId,
            organizationId: fixture.organizationId,
            key: "owner",
            name: "组织自定义",
            isSystem: false,
          },
        ]);
        const permissionId = randomUUID();
        await pg.db.insert(schema.permissions).values({
          id: permissionId,
          key: "custom:test",
          name: "自定义许可",
          resource: "custom",
          action: "test",
          description: "测试",
        });
        await pg.db.insert(schema.rolePermissions).values([
          { roleId: customId, permissionId },
          { roleId: viewerId, permissionId },
        ]);
        await pg.db.insert(schema.menus).values({
          organizationId: fixture.organizationId,
          name: "测试自定义菜单",
          type: "directory",
          isVisible: true,
        });
        const menusBefore = await pg.db.select().from(schema.menus);
        const full = await pg.applyMigrations();
        expect(full.entries).toHaveLength(14);
        expect(
          await pg.client`SELECT id, source_key, amount_minor, snapshot FROM rental_bills ORDER BY id`,
        ).toEqual(oldBills);
        expect(
          await pg.client`SELECT id, bill_id, amount_minor, kind::text FROM rental_bill_lines ORDER BY id`,
        ).toEqual(oldLines);
        const updatedBills = await pg.db.select().from(schema.rentalBills);
        expect(
          updatedBills.map((bill) => [bill.modelVersion, bill.billingMonth, bill.revision]),
        ).toEqual([
          [1, null, 1],
          [1, null, 1],
        ]);
        const [contract] = await pg.db
          .select()
          .from(schema.rentalContracts)
          .where(eq(schema.rentalContracts.id, fixture.scope.contractId));
        expect(contract?.billingMode).toBe("legacy_receivable");
        const checkGrants = async () => {
          const grants = await pg.db.select().from(schema.rolePermissions);
          expect(grants.filter((grant) => grant.roleId === ownerId)).toHaveLength(12);
          expect(grants.filter((grant) => grant.roleId === adminId)).toHaveLength(12);
          expect(grants.filter((grant) => grant.roleId === viewerId)).toEqual([
            { roleId: viewerId, permissionId },
          ]);
          expect(grants.filter((grant) => grant.roleId === customId)).toEqual([
            { roleId: customId, permissionId },
          ]);
          expect(await pg.db.select().from(schema.menus)).toEqual(menusBefore);
        };
        await checkGrants();
        const permissionsMigration = full.entries.at(-1);
        if (!permissionsMigration) throw new Error("权限迁移缺失");
        const permissionSql = await readFile(permissionsMigration.originalPath, "utf8");
        // 单独重复真实权限 DML，区别于 runner 按名称跳过。
        await pg.db.transaction(async (tx) => {
          for (const statement of permissionSql.split("--> statement-breakpoint"))
            await tx.execute(sql.raw(statement));
        });
        await checkGrants();
        const history = await pg.client`SELECT name, hash FROM __drizzle_migrations ORDER BY name`;
        expect(history).toHaveLength(14);
        await pg.applyMigrations();
        expect(await pg.client`SELECT name, hash FROM __drizzle_migrations ORDER BY name`).toEqual(
          history,
        );
        await checkGrants();
      });
    },
    120000,
  );
});
