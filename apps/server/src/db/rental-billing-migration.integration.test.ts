import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { rentalBillLineKinds, rentalBillTypes } from "@xpense/shared";

import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import {
  rentalBillAdjustments,
  rentalBillGenerations,
  rentalBillLineKind,
  rentalBillLines,
  rentalBillNumberCounters,
  rentalBills,
  rentalBillType,
} from "./schema/rental-billing.js";

describe("租赁账单持久化契约", () => {
  it("持久化账单和明细枚举与共享契约一致", () => {
    expect(rentalBillType.enumValues).toEqual(rentalBillTypes);
    expect(rentalBillLineKind.enumValues).toEqual(rentalBillLineKinds);
  });

  it("历史账单的合同引用不依赖可修正的房产归属", () => {
    const foreignKey = getTableConfig(rentalBills).foreignKeys.find(
      (key) => key.getName() === "rental_bills_contract_scope_fk",
    );
    expect(foreignKey?.reference().columns.map((column) => column.name)).toEqual([
      "organization_id",
      "contract_id",
    ]);
    expect(getTableConfig(rentalBills).foreignKeys.map((key) => key.getName())).toContain(
      "rental_bills_property_scope_fk",
    );
  });
  it("租金完整性约束显式拒绝空有效期，避免 SQL NULL 绕过 CHECK", () => {
    const constraint = getTableConfig(rentalBills).checks.find(
      (check) => check.name === "rental_bills_period_check",
    );
    expect(constraint).toBeDefined();
    if (!constraint) throw new Error("missing billing period check");
    expect(new PgDialect().sqlToQuery(constraint.value).sql.toLowerCase()).toContain(
      '"effective_end" is not null',
    );
  });
  it("五类表及组织复合引用、有效来源和幂等唯一约束", () => {
    expect(
      [
        rentalBillAdjustments,
        rentalBillGenerations,
        rentalBillLines,
        rentalBillNumberCounters,
        rentalBills,
      ].map((table) => getTableConfig(table).name),
    ).toEqual([
      "rental_bill_adjustments",
      "rental_bill_generations",
      "rental_bill_lines",
      "rental_bill_number_counters",
      "rental_bills",
    ]);
    const bills = getTableConfig(rentalBills);
    expect(bills.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "rental_bills_contract_scope_fk",
        "rental_bills_generation_scope_fk",
        "rental_bills_adjustment_scope_fk",
      ]),
    );
    const index = bills.indexes.find(
      (item) => item.config.name === "rental_bills_active_source_unique",
    );
    expect(index?.config.unique).toBe(true);
    expect(index?.config.where).toBeDefined();
    expect(
      getTableConfig(rentalBillGenerations).uniqueConstraints.map((key) => key.name),
    ).toContain("rental_bill_generations_request_unique");
    expect(
      getTableConfig(rentalBillAdjustments).indexes.find(
        (item) => item.config.name === "rental_bill_adjustments_current_unique",
      )?.config.where,
    ).toBeDefined();
  });
  it("迁移只新增应收与增量菜单，不回填应收或修改余额", async () => {
    const base = new URL("./migrations/", import.meta.url);
    const entry = (await readdir(base)).find((name) => name.endsWith("_rental_billing"));
    expect(entry).toBeDefined();
    const migration = await readFile(new URL(`${entry}/migration.sql`, base), "utf8");
    expect(migration).not.toMatch(
      /DELETE FROM\s+"?menus|UPDATE\s+"?accounts|INSERT INTO\s+"?rental_bills"?\s/i,
    );
    expect(migration).toContain("rental_bills_active_source_unique");
    expect(migration).toContain("RentalBillDetail");
    expect(migration).toContain("ON CONFLICT");
  });

  it("真实 PostgreSQL 验证有效来源、组织引用、回滚及菜单重复补充", async (context) => {
    const databaseUrl = process.env.RENTAL_MIGRATION_TEST_DATABASE_URL;
    if (!databaseUrl) {
      context.skip("专用一次性 PostgreSQL 测试库未配置，DDL/清理尚未获授权");
      return;
    }
    const base = new URL("./migrations/", import.meta.url);
    const entry = (await readdir(base)).find((name) => name.endsWith("_rental_billing"));
    const migration = await readFile(new URL(`${entry}/migration.sql`, base), "utf8");
    const bootstrap = migration.slice(migration.indexOf("-- 增量权限和菜单"));
    const schema = `billing_${randomUUID().replaceAll("-", "")}`;
    const client = postgres(databaseUrl, { max: 1 });
    const workerA = postgres(databaseUrl, {
      max: 1,
      connection: { lock_timeout: 5000, statement_timeout: 10000 },
    });
    const workerB = postgres(databaseUrl, {
      max: 1,
      connection: { lock_timeout: 5000, statement_timeout: 10000 },
    });
    const org1 = "00000000-0000-4000-8000-000000000011";
    const org2 = "00000000-0000-4000-8000-000000000012";
    const user = "00000000-0000-4000-8000-000000000001";
    const contract1 = "00000000-0000-4000-8000-000000000021";
    const contract2 = "00000000-0000-4000-8000-000000000022";
    const property = "00000000-0000-4000-8000-000000000031";
    const property2 = "00000000-0000-4000-8000-000000000032";
    const correctedProperty = "00000000-0000-4000-8000-000000000033";
    const generation1 = "00000000-0000-4000-8000-000000000041";
    const generation2 = "00000000-0000-4000-8000-000000000042";
    const firstBill = "00000000-0000-4000-8000-000000000051";
    try {
      await client.unsafe(`CREATE SCHEMA "${schema}"`);
      await client.unsafe(`SET search_path TO "${schema}"`);
      await client.unsafe(`
        CREATE TABLE users (id uuid PRIMARY KEY);
        CREATE TABLE organizations (id uuid PRIMARY KEY);
        CREATE TABLE rental_properties (id uuid PRIMARY KEY, organization_id uuid NOT NULL, UNIQUE (organization_id, id));
        CREATE TABLE rental_contracts (id uuid PRIMARY KEY, organization_id uuid NOT NULL, property_id uuid NOT NULL, rent_amount_minor bigint NOT NULL DEFAULT 300000, UNIQUE (organization_id, id), UNIQUE (organization_id, property_id, id));
        CREATE TABLE permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE, name text, resource text, action text, description text);
        CREATE TABLE roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text, is_system boolean, organization_id uuid);
        CREATE TABLE role_permissions (role_id uuid, permission_id uuid, PRIMARY KEY (role_id, permission_id));
        CREATE TYPE menu_type AS ENUM ('directory', 'menu', 'button');
        CREATE TABLE menus (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid, parent_id integer, type menu_type, name text, route_key text, path text, icon text, permission_code text, is_external boolean, is_visible boolean, keep_alive boolean, sort_order integer DEFAULT 0);
      `);
      await client`INSERT INTO users VALUES (${user})`;
      await client`INSERT INTO organizations VALUES (${org1}), (${org2})`;
      await client`INSERT INTO rental_properties VALUES (${property},${org1}),(${property2},${org2}),(${correctedProperty},${org1})`;
      await client`INSERT INTO rental_contracts (id, organization_id, property_id) VALUES (${contract1}, ${org1}, ${property}), (${contract2}, ${org2}, ${property2})`;
      await client`INSERT INTO roles (key, is_system, organization_id) VALUES ('owner', true, NULL), ('admin', true, NULL), ('custom', false, ${org1})`;
      await client`INSERT INTO menus (organization_id, type, name, route_key, is_visible, sort_order) VALUES (${org1}, 'directory', '自定义目录', NULL, false, 42), (${org2}, 'menu', '自定义账单', 'RentalBills', false, 91)`;
      await client`INSERT INTO menus (organization_id, parent_id, type, name, route_key) SELECT ${org1}, id, 'menu', '旧合同', 'RentalContracts' FROM menus WHERE organization_id = ${org1}`;
      await client.unsafe(migration);
      const scopeEntry = (await readdir(base)).find((name) =>
        name.endsWith("_rental_billing_scope"),
      );
      if (!scopeEntry) throw new Error("missing billing scope repair migration");
      await client.unsafe(await readFile(new URL(`${scopeEntry}/migration.sql`, base), "utf8"));
      const before = await client`SELECT * FROM menus ORDER BY id`;
      await client.unsafe(bootstrap);
      expect(await client`SELECT * FROM menus ORDER BY id`).toEqual(before);
      expect(before.find((row) => row.name === "自定义账单")).toMatchObject({
        is_visible: false,
        sort_order: 91,
      });
      const directory = before.find((row) => row.name === "自定义目录");
      expect(
        before.find((row) => row.organization_id === org1 && row.route_key === "RentalBills")
          ?.parent_id,
      ).toBe(directory?.id);
      expect(
        await client`SELECT * FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.key = 'custom'`,
      ).toHaveLength(0);
      await client`INSERT INTO rental_bill_generations (id, organization_id, contract_id, idempotency_key, request_hash, source_version, origin, created_count, existing_count, totals, created_by_user_id) VALUES (${generation1}, ${org1}, ${contract1}, 'key', 'hash', 'v', 'manual', 1, 0, '{}', ${user}), (${generation2}, ${org2}, ${contract2}, 'key', 'hash', 'v', 'manual', 1, 0, '{}', ${user})`;
      const insertBill = (
        id: string,
        organizationId: string,
        contractId: string,
        generationId: string,
        number: string,
      ) =>
        client`INSERT INTO rental_bills (id, organization_id, contract_id, property_id, bill_number, contract_number, property_name, currency_code, type, source_key, due_date, amount_minor, generation_id, snapshot, created_by_user_id) VALUES (${id}, ${organizationId}, ${contractId}, ${organizationId === org2 ? property2 : property}, ${number}, 'RC', '房产', 'CNY', 'deposit', 'same-source', '2026-01-01', 100, ${generationId}, '{}', ${user})`;
      await insertBill(firstBill, org1, contract1, generation1, "RB-1");
      await expect(
        insertBill(randomUUID(), org1, contract1, generation1, "RB-2"),
      ).rejects.toMatchObject({ code: "23505" });
      await insertBill(randomUUID(), org2, contract2, generation2, "RB-1");
      await client`UPDATE rental_bills SET status = 'voided', voided_at = NOW(), voided_by = ${user}, void_reason = 'correction' WHERE id = ${firstBill}`;
      await insertBill(randomUUID(), org1, contract1, generation1, "RB-3");
      await expect(
        insertBill(randomUUID(), org2, contract1, generation1, "RB-cross"),
      ).rejects.toMatchObject({ code: "23503" });
      const rollbackBillId = randomUUID();
      await expect(
        client.begin(async (tx) => {
          const id = randomUUID();
          await tx`INSERT INTO rental_bill_generations (id, organization_id, contract_id, idempotency_key, request_hash, source_version, origin, created_count, existing_count, totals, created_by_user_id) VALUES (${id}, ${org1}, ${contract1}, 'rollback', 'hash', 'v', 'manual', 1, 0, '{}', ${user})`;
          await tx`INSERT INTO rental_bill_number_counters (organization_id, year, last_value) VALUES (${org1},2027,1)`;
          await tx`INSERT INTO rental_bills (id, organization_id, contract_id, property_id, bill_number, contract_number, property_name, currency_code, type, source_key, due_date, amount_minor, generation_id, snapshot, created_by_user_id) VALUES (${rollbackBillId}, ${org1}, ${contract1}, ${property}, 'RB-rollback', 'RC', '房产', 'CNY', 'deposit', 'rollback-source', '2026-01-01', 100, ${id}, '{}', ${user})`;
          await tx`INSERT INTO rental_bill_lines (organization_id, contract_id, bill_id, kind, label, amount_minor, sort_order) VALUES (${org1},${contract1},${rollbackBillId},'deposit','押金',100,0)`;
          throw new Error("rollback marker");
        }),
      ).rejects.toThrow("rollback marker");
      expect(
        await client`SELECT id FROM rental_bill_generations WHERE idempotency_key = 'rollback'`,
      ).toHaveLength(0);
      expect(await client`SELECT id FROM rental_bills WHERE id=${rollbackBillId}`).toHaveLength(0);
      expect(
        await client`SELECT id FROM rental_bill_lines WHERE bill_id=${rollbackBillId}`,
      ).toHaveLength(0);
      expect(
        await client`SELECT year FROM rental_bill_number_counters WHERE organization_id=${org1} AND year=2027`,
      ).toHaveLength(0);
      await workerA.unsafe(`SET search_path TO "${schema}"`);
      await workerB.unsafe(`SET search_path TO "${schema}"`);
      const [pidA] = await workerA`SELECT pg_backend_pid() AS pid`;
      const [pidB] = await workerB`SELECT pg_backend_pid() AS pid`;
      expect(pidA?.pid).not.toBe(pidB?.pid);
      const raceSource = (worker: typeof client, number: string) =>
        worker`INSERT INTO rental_bills (id, organization_id, contract_id, property_id, bill_number, contract_number, property_name, currency_code, type, source_key, due_date, amount_minor, generation_id, snapshot, created_by_user_id) VALUES (${randomUUID()}, ${org1}, ${contract1}, ${property}, ${number}, 'RC', '房产', 'CNY', 'deposit', 'race-source', '2026-01-01', 100, ${generation1}, '{}', ${user})`;
      const competingBills = await Promise.allSettled([
        raceSource(workerA, "RB-race-A"),
        raceSource(workerB, "RB-race-B"),
      ]);
      expect(competingBills.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(competingBills.find((result) => result.status === "rejected")).toMatchObject({
        reason: { code: "23505" },
      });
      const sameRequest = (worker: typeof client) =>
        worker.begin(async (tx) => {
          await tx`SELECT id FROM rental_contracts WHERE organization_id=${org1} AND id=${contract1} FOR UPDATE`;
          const [existing] =
            await tx`SELECT id FROM rental_bill_generations WHERE organization_id=${org1} AND idempotency_key='race-request'`;
          if (existing) return existing.id;
          const id = randomUUID();
          await tx`INSERT INTO rental_bill_generations (id, organization_id, contract_id, idempotency_key, request_hash, source_version, origin, created_count, existing_count, totals, created_by_user_id) VALUES (${id}, ${org1}, ${contract1}, 'race-request', 'hash', 'v', 'manual', 1, 0, '{}', ${user})`;
          return id;
        });
      const requestIds = await Promise.all([sameRequest(workerA), sameRequest(workerB)]);
      expect(requestIds[0]).toBe(requestIds[1]);
      expect(
        await client`SELECT id FROM rental_bill_generations WHERE idempotency_key='race-request'`,
      ).toHaveLength(1);

      let signalLocked = () => {};
      const locked = new Promise<void>((resolve) => {
        signalLocked = resolve;
      });
      let release = () => {};
      const releaseGeneration = new Promise<void>((resolve) => {
        release = resolve;
      });
      const generation = workerA.begin(async (tx) => {
        const [contract] =
          await tx`SELECT rent_amount_minor FROM rental_contracts WHERE organization_id=${org1} AND id=${contract1} FOR UPDATE`;
        signalLocked();
        await releaseGeneration;
        await tx`INSERT INTO rental_bills (id, organization_id, contract_id, property_id, bill_number, contract_number, property_name, currency_code, type, source_key, due_date, amount_minor, generation_id, snapshot, created_by_user_id) VALUES (${randomUUID()}, ${org1}, ${contract1}, ${property}, 'RB-modification-race', 'RC', '房产', 'CNY', 'deposit', 'modification-race', '2026-01-01', ${contract?.rent_amount_minor}, ${generation1}, '{}', ${user})`;
      });
      await Promise.race([locked, generation]);
      const correction = workerB.begin(async (tx) => {
        await tx`SELECT id FROM rental_contracts WHERE organization_id=${org1} AND id=${contract1} FOR UPDATE`;
        await tx`UPDATE rental_contracts SET rent_amount_minor=400000 WHERE id=${contract1}`;
        await tx`UPDATE rental_bills SET status='voided',voided_at=NOW(),voided_by=${user},void_reason='correction-race' WHERE organization_id=${org1} AND source_key='modification-race'`;
      });
      try {
        let blocked = false;
        const deadline = Date.now() + 3000;
        while (!blocked && Date.now() < deadline) {
          const [activity] =
            await client`SELECT wait_event_type FROM pg_stat_activity WHERE pid=${pidB?.pid}`;
          blocked = activity?.wait_event_type === "Lock";
        }
        expect(blocked).toBe(true);
      } finally {
        release();
      }
      await Promise.all([generation, correction]);
      expect(
        await client`SELECT id FROM rental_bills WHERE source_key='modification-race' AND status='active'`,
      ).toHaveLength(0);
      expect(
        await client`SELECT amount_minor,status FROM rental_bills WHERE source_key='modification-race'`,
      ).toMatchObject([{ amount_minor: "300000", status: "voided" }]);
      await client`UPDATE rental_contracts SET property_id=${correctedProperty} WHERE id=${contract1}`;
      expect(
        await client`SELECT property_id FROM rental_bills WHERE id=${firstBill}`,
      ).toMatchObject([{ property_id: property }]);
      await expect(
        client`UPDATE rental_bills SET property_id=${property2} WHERE id=${firstBill}`,
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await Promise.all([workerA.end({ timeout: 1 }), workerB.end({ timeout: 1 })]);
      await client.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  }, 30000);
});
