import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { AuditService } from "../modules/audit/audit.service.js";
import { BillRevisionsService } from "../modules/rental/bill-revisions.service.js";
import { ContractsPolicyService } from "../modules/rental/contracts-policy.service.js";
import { RentalCashService } from "../modules/rental/rental-cash.service.js";
import { rentalCashSourceVersion } from "../modules/rental/rental-cash.version.rules.js";
import { RentalCashProjectionRepository } from "../modules/rental/rental-cash-projection.repository.js";
import { RentalSettlementsService } from "../modules/rental/rental-settlements.service.js";
import {
  assertRentalCleanupObjects,
  readRentalCleanupObjects,
} from "../test/rental-postgres-cleanup.js";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { insertRentalPostgresFixture } from "../test/rental-postgres-fixtures.js";
import { type RentalPostgresHarness, withRentalPostgres } from "../test/rental-postgres-harness.js";
import { createRentalPostgresServices } from "../test/rental-postgres-services.js";
import type { AppDb } from "./db.module.js";
import * as tables from "./schema.js";

const url = rentalTestDatabaseUrl(process.env);
type Fixture = Awaited<ReturnType<typeof insertRentalPostgresFixture>>;
type Target = { kind: "bill"; billId: string } | { kind: "settlement"; settlementId: string };
const intent = () => ({ occurredOn: "2026-02-28", idempotencyKey: randomUUID() });

async function cashVersion(module: TestingModule, db: AppDb, fixture: Fixture, target: Target) {
  const [facts] = await module
    .get(RentalCashProjectionRepository)
    .readMany(fixture.organizationId, [fixture.scope.contractId], db);
  if (!facts) throw new Error("真实合同投影缺失");
  return rentalCashSourceVersion(facts, target);
}

async function counts(db: AppDb) {
  const [cash, requests, audits, billHistory, meterHistory, settlements, settlementHistory] =
    await Promise.all([
      db.select().from(tables.rentalCashEntries),
      db.select().from(tables.rentalFinanceRequests),
      db.select().from(tables.auditLogs),
      db.select().from(tables.rentalBillRevisions),
      db.select().from(tables.rentalMeterReadingRevisions),
      db.select().from(tables.rentalSettlements),
      db.select().from(tables.rentalSettlementRevisions),
    ]);
  return {
    cash: cash.length,
    requests: requests.length,
    audits: audits.length,
    billHistory: billHistory.length,
    meterHistory: meterHistory.length,
    settlements: settlements.length,
    settlementHistory: settlementHistory.length,
  };
}

async function scenario(
  run: (context: {
    pg: RentalPostgresHarness;
    a: TestingModule;
    b: TestingModule;
    fixture: Fixture;
    race: <T>(
      first: () => Promise<T>,
      second: () => Promise<T>,
    ) => Promise<{ value: T; winner: "a" | "b" }>;
  }) => Promise<void>,
  futureOnly = false,
) {
  if (!url) throw new Error("真实库及隔离 DDL 许可未配置");
  await withRentalPostgres(url, async (pg) => {
    await pg.applyMigrations();
    const fixture = await insertRentalPostgresFixture(pg.db, false, futureOnly);
    const worker = await pg.connect();
    const observer = await pg.connect();
    expect(new Set([pg.pid, worker.pid, observer.pid]).size).toBe(3);
    const a = await createRentalPostgresServices(pg.db);
    const b = await createRentalPostgresServices(worker.db);
    const race = async <T>(first: () => Promise<T>, second: () => Promise<T>) => {
      let acquired!: () => void;
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const policy = a.get(ContractsPolicyService);
      const original = policy.lockOrganizationContext.bind(policy);
      const spy = vi
        .spyOn(policy, "lockOrganizationContext")
        .mockImplementationOnce(async (...args) => {
          const result = await original(...args);
          acquired();
          await gate;
          return result;
        });
      const outcome = (call: () => Promise<T>) =>
        call().then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error: error as unknown }),
        );
      const left = outcome(first);
      let right: ReturnType<typeof outcome> | undefined;
      let observed = false;
      try {
        await Promise.race([
          held,
          left.then(() => {
            throw new Error("首个请求未进入真实锁");
          }),
        ]);
        right = outcome(second);
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const [activity] =
            await observer.client`SELECT wait_event_type FROM pg_stat_activity WHERE pid = ${worker.pid}`;
          if (activity?.wait_event_type === "Lock") {
            observed = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      } finally {
        release();
        spy.mockRestore();
      }
      const results = await Promise.all([left, right]);
      expect(observed, "第二真实 backend 必须实际等待组织锁").toBe(true);
      expect(results.filter((result) => result?.error === null)).toHaveLength(1);
      const failed = results.find((result) => result?.error !== null)?.error;
      expect(failed).toBeInstanceOf(HttpException);
      expect((failed as HttpException).getStatus()).toBe(409);
      const winner: "a" | "b" = results[0]?.error === null ? "a" : "b";
      const value = results[winner === "a" ? 0 : 1]?.value;
      if (!value) throw new Error("竞争成功结果缺失");
      return { value, winner };
    };
    try {
      await run({ pg, a, b, fixture, race });
    } finally {
      await a.close();
      await b.close();
    }
  });
}

describe("真实 PostgreSQL 租赁财务事务与竞争（需专用库和明确 DDL 许可）", () => {
  it.skipIf(!url)(
    "其他测试 schema 的 operator 依赖必须被拒绝，移除依赖后只清理本次对象",
    async () => {
      if (!url) throw new Error("真实库及 DDL 许可未配置");
      await withRentalPostgres(url, async (own) => {
        await own.client.unsafe(`CREATE TYPE "${own.schema}"."cleanup_operand" AS ENUM ('a', 'b')`);
        await withRentalPostgres(url, async (other) => {
          await other.client.unsafe(
            `CREATE FUNCTION "${other.schema}"."cleanup_equals"("${own.schema}"."cleanup_operand", "${own.schema}"."cleanup_operand") RETURNS boolean LANGUAGE sql AS 'SELECT $1::text = $2::text'`,
          );
          await other.client.unsafe(
            `CREATE OPERATOR "${other.schema}".=== (FUNCTION = "${other.schema}"."cleanup_equals", LEFTARG = "${own.schema}"."cleanup_operand", RIGHTARG = "${own.schema}"."cleanup_operand")`,
          );
          const closure = await readRentalCleanupObjects(own.client, own.schemaOid);
          expect(closure).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ catalog: "pg_operator", namespace: other.schema }),
            ]),
          );
          expect(() => assertRentalCleanupObjects(own.schema, closure)).toThrow("拒绝清理");
          const operators =
            await other.client`SELECT oid FROM pg_operator WHERE oprnamespace = ${other.schemaOid}`;
          expect(operators).toHaveLength(1);
        });
        // 第二 helper 已清理自己的 operator/function；原类型仍保留，第一 helper 才能清理。
        const [operand] =
          await own.client`SELECT oid FROM pg_type WHERE typnamespace = ${own.schemaOid} AND typname = 'cleanup_operand'`;
        expect(operand).toBeDefined();
        expect(() => assertRentalCleanupObjects(own.schema, [])).toThrow("拒绝清理");
        assertRentalCleanupObjects(
          own.schema,
          await readRentalCleanupObjects(own.client, own.schemaOid),
        );
      });
    },
    120000,
  );

  it("服务图仅显式注入 DB，不连接默认库", async () => {
    const module = await createRentalPostgresServices({} as AppDb);
    expect(module.get(RentalCashService)).toBeInstanceOf(RentalCashService);
    expect(module.get(BillRevisionsService)).toBeInstanceOf(BillRevisionsService);
    expect(module.get(RentalSettlementsService)).toBeInstanceOf(RentalSettlementsService);
    await module.close();
  });

  it.skipIf(!url)(
    "两个不同意图登记最后余额，只提交一次并可原键重放",
    async () =>
      scenario(async ({ pg, a, b, fixture, race }) => {
        const target = { kind: "bill" as const, billId: fixture.ids.january };
        const cashA = a.get(RentalCashService);
        const cashB = b.get(RentalCashService);
        await cashA.recordReceipt(fixture.auth, {
          target,
          amountMinor: 10000,
          ...intent(),
          expectedVersion: await cashVersion(a, pg.db, fixture, target),
        });
        const expectedVersion = await cashVersion(a, pg.db, fixture, target);
        const inputs = [
          { target, amountMinor: 1000, ...intent(), expectedVersion },
          { target, amountMinor: 1000, ...intent(), expectedVersion },
        ] as const;
        const before = await counts(pg.db);
        const winner = await race(
          () => cashA.recordReceipt(fixture.auth, inputs[0]),
          () => cashB.recordReceipt(fixture.auth, inputs[1]),
        );
        const after = await counts(pg.db);
        expect(after).toEqual({
          ...before,
          cash: before.cash + 1,
          requests: before.requests + 1,
          audits: before.audits + 1,
        });
        const entries = await pg.db.select().from(tables.rentalCashEntries);
        expect(entries.reduce((sum, entry) => sum + entry.amountMinor, 0)).toBe(11000);
        expect(
          await cashA.recordReceipt(fixture.auth, inputs[winner.winner === "a" ? 0 : 1]),
        ).toEqual(winner.value);
        expect(await counts(pg.db)).toEqual(after);
        expect(await cashVersion(a, pg.db, fixture, target)).not.toBe(expectedVersion);
      }),
    120000,
  );

  it.skipIf(!url)(
    "两个押金整额确认保留唯一有效事实",
    async () =>
      scenario(async ({ pg, a, b, fixture, race }) => {
        const target = { kind: "bill" as const, billId: fixture.ids.deposit };
        const expectedVersion = await cashVersion(a, pg.db, fixture, target);
        const inputs = [
          { billId: target.billId, expectedVersion, ...intent() },
          { billId: target.billId, expectedVersion, ...intent() },
        ] as const;
        const before = await counts(pg.db);
        const winner = await race(
          () => a.get(RentalCashService).confirmDepositReceipt(fixture.auth, inputs[0]),
          () => b.get(RentalCashService).confirmDepositReceipt(fixture.auth, inputs[1]),
        );
        expect(winner.value).toMatchObject({ amountMinor: 5000, purpose: "deposit_receipt" });
        expect(await counts(pg.db)).toEqual({ ...before, cash: 1, requests: 1, audits: 1 });
        const after = await counts(pg.db);
        expect(
          await a
            .get(RentalCashService)
            .confirmDepositReceipt(fixture.auth, inputs[winner.winner === "a" ? 0 : 1]),
        ).toEqual(winner.value);
        expect(await counts(pg.db)).toEqual(after);
      }),
    120000,
  );

  it.skipIf(!url)(
    "两个全额退款只退一次，并恢复准确净收",
    async () =>
      scenario(async ({ pg, a, b, fixture, race }) => {
        for (const [billId, amountMinor] of [
          [fixture.ids.january, 11000],
          [fixture.ids.february, 12000],
          [fixture.ids.deposit, 5000],
        ] as const) {
          const target = { kind: "bill" as const, billId };
          const expectedVersion = await cashVersion(a, pg.db, fixture, target);
          if (billId === fixture.ids.deposit)
            await a
              .get(RentalCashService)
              .confirmDepositReceipt(fixture.auth, { billId, expectedVersion, ...intent() });
          else
            await a
              .get(RentalCashService)
              .recordReceipt(fixture.auth, { target, amountMinor, expectedVersion, ...intent() });
        }
        const input = { contractId: fixture.scope.contractId, extraFees: [] };
        const service = a.get(RentalSettlementsService);
        const preview = await service.preview(fixture.auth, input);
        expect(preview.canConfirm).toBe(true);
        const settlement = await service.confirm(fixture.auth, {
          ...input,
          expectedVersion: preview.version,
          idempotencyKey: randomUUID(),
        });
        expect(settlement).toMatchObject({
          finalCostMinor: 23000,
          revision: 2,
          balance: { refundableMinor: 5000, receivedMinor: 28000 },
        });
        const target = { kind: "settlement" as const, settlementId: settlement.id };
        const expectedVersion = await cashVersion(a, pg.db, fixture, target);
        const inputs = [
          { target, expectedVersion, ...intent() },
          { target, expectedVersion, ...intent() },
        ] as const;
        const before = await counts(pg.db);
        const winner = await race(
          () => a.get(RentalCashService).confirmRefund(fixture.auth, inputs[0]),
          () => b.get(RentalCashService).confirmRefund(fixture.auth, inputs[1]),
        );
        expect(winner.value.amountMinor).toBe(5000);
        expect(await counts(pg.db)).toEqual({
          ...before,
          cash: before.cash + 1,
          requests: before.requests + 1,
          audits: before.audits + 1,
          settlementHistory: before.settlementHistory + 1,
        });
        const after = await counts(pg.db);
        expect(
          await a
            .get(RentalCashService)
            .confirmRefund(fixture.auth, inputs[winner.winner === "a" ? 0 : 1]),
        ).toEqual(winner.value);
        expect(await counts(pg.db)).toEqual(after);
        expect((await service.detail(fixture.auth, input)).settlement).toMatchObject({
          status: "settled",
          revision: 3,
          balance: {
            netReceivedMinor: 23000,
            refundedMinor: 5000,
            refundableMinor: 0,
            outstandingMinor: 0,
          },
        });
      }),
    120000,
  );

  it.skipIf(!url)(
    "共享历史读数更正争用保留两期历史单价和立即外键",
    async () =>
      scenario(async ({ pg, a, b, fixture, race }) => {
        const first = {
          billId: fixture.ids.january,
          expectedVersion: "preview",
          reason: "更正为115",
          readings: [{ kind: "water" as const, readingDate: "2026-01-31", reading: "115" }],
        };
        const second = {
          ...first,
          reason: "更正为114",
          readings: [{ kind: "water" as const, readingDate: "2026-01-31", reading: "114" }],
        };
        const inputs = [
          {
            ...first,
            expectedVersion: (await a.get(BillRevisionsService).preview(fixture.auth, first))
              .version,
            idempotencyKey: randomUUID(),
          },
          {
            ...second,
            expectedVersion: (await b.get(BillRevisionsService).preview(fixture.auth, second))
              .version,
            idempotencyKey: randomUUID(),
          },
        ] as const;
        const winner = await race(
          () => a.get(BillRevisionsService).adjust(fixture.auth, inputs[0]),
          () => b.get(BillRevisionsService).adjust(fixture.auth, inputs[1]),
        );
        expect(winner.winner).toBe("a");
        const bills = await pg.db.select().from(tables.rentalBills);
        expect(bills.find((bill) => bill.id === fixture.ids.january)).toMatchObject({
          amountMinor: 11500,
          revision: 2,
        });
        expect(bills.find((bill) => bill.id === fixture.ids.february)).toMatchObject({
          amountMinor: 11000,
          revision: 2,
        });
        expect(await counts(pg.db)).toMatchObject({
          cash: 0,
          requests: 1,
          audits: 1,
          billHistory: 2,
          meterHistory: 1,
        });
        const lines = await pg.db
          .select()
          .from(tables.rentalBillLines)
          .where(eq(tables.rentalBillLines.billId, fixture.ids.february));
        expect(lines.find((line) => line.kind === "water")?.feeSnapshot).toMatchObject({
          unitPrice: "2.0000",
          startReading: first.readings[0]?.reading,
          endReading: "120.0000",
        });
        const readings = await pg.db.select().from(tables.rentalMeterReadings);
        expect(readings.find((reading) => reading.id === fixture.readings[1]?.id)).toMatchObject({
          revision: 2,
          reading: "115.0000",
        });
        expect(
          readings.find((reading) => reading.id === fixture.readings[2]?.id)?.predecessorId,
        ).toBe(fixture.readings[1]?.id);
        expect(await pg.db.select().from(tables.rentalBillMeterIntervals)).toHaveLength(3);
        const after = await counts(pg.db);
        expect(await a.get(BillRevisionsService).adjust(fixture.auth, inputs[0])).toEqual(
          winner.value,
        );
        expect(await counts(pg.db)).toEqual(after);
      }),
    120000,
  );

  it.skipIf(!url)(
    "双结算确认只产生一个当前事件且原键重放",
    async () =>
      scenario(async ({ pg, a, b, fixture, race }) => {
        const input = { contractId: fixture.scope.contractId, extraFees: [] };
        const preview = await a.get(RentalSettlementsService).preview(fixture.auth, input);
        expect(preview.canConfirm).toBe(true);
        const inputs = [
          { ...input, expectedVersion: preview.version, idempotencyKey: randomUUID() },
          { ...input, expectedVersion: preview.version, idempotencyKey: randomUUID() },
        ] as const;
        const winner = await race<unknown>(
          () => a.get(RentalSettlementsService).confirm(fixture.auth, inputs[0]),
          () => b.get(RentalSettlementsService).confirm(fixture.auth, inputs[1]),
        );
        expect(winner.value).toMatchObject({
          finalCostMinor: 23000,
          kind: "expiry",
          effectiveEndDate: "2026-02-28",
          revision: 2,
          status: "pending_collection",
          balance: { outstandingMinor: 23000 },
        });
        expect(await counts(pg.db)).toMatchObject({
          settlements: 1,
          settlementHistory: 1,
          requests: 1,
          audits: 1,
          cash: 0,
        });
        const links = await pg.db.select().from(tables.rentalSettlementBills);
        expect(links.map((link) => link.billId).sort()).toEqual(Object.values(fixture.ids).sort());
        const after = await counts(pg.db);
        expect(
          await a
            .get(RentalSettlementsService)
            .confirm(fixture.auth, inputs[winner.winner === "a" ? 0 : 1]),
        ).toEqual(winner.value);
        expect(await counts(pg.db)).toEqual(after);
      }),
    120000,
  );

  it.skipIf(!url)(
    "结算确认与旧账单最后收款竞争，关闭陈旧入口",
    async () =>
      scenario(async ({ pg, a, b, fixture, race }) => {
        const input = { contractId: fixture.scope.contractId, extraFees: [] };
        const target = { kind: "bill" as const, billId: fixture.ids.january };
        const preview = await a.get(RentalSettlementsService).preview(fixture.auth, input);
        const receipt = {
          target,
          amountMinor: 1000,
          expectedVersion: await cashVersion(a, pg.db, fixture, target),
          ...intent(),
        };
        await race<unknown>(
          () =>
            a.get(RentalSettlementsService).confirm(fixture.auth, {
              ...input,
              expectedVersion: preview.version,
              idempotencyKey: randomUUID(),
            }),
          () => b.get(RentalCashService).recordReceipt(fixture.auth, receipt),
        );
        expect(await counts(pg.db)).toMatchObject({
          settlements: 1,
          cash: 0,
          requests: 1,
          audits: 1,
        });
      }),
    120000,
  );

  it.skipIf(!url)(
    "必需审计失败回滚现金、幂等、相邻更正和结算的全部事实",
    async () =>
      scenario(async ({ pg, a, fixture }) => {
        const target = { kind: "bill" as const, billId: fixture.ids.january };
        const receipt = {
          target,
          amountMinor: 1000,
          expectedVersion: await cashVersion(a, pg.db, fixture, target),
          ...intent(),
        };
        const revision = {
          billId: fixture.ids.january,
          expectedVersion: "preview",
          reason: "回滚探针",
          readings: [{ kind: "water" as const, readingDate: "2026-01-31", reading: "115" }],
        };
        const revisedVersion = (await a.get(BillRevisionsService).preview(fixture.auth, revision))
          .version;
        const input = { contractId: fixture.scope.contractId, extraFees: [] };
        const settlementVersion = (
          await a.get(RentalSettlementsService).preview(fixture.auth, input)
        ).version;
        const before = await counts(pg.db);
        const bills = await pg.db.select().from(tables.rentalBills);
        const readings = await pg.db.select().from(tables.rentalMeterReadings);
        const intervals = await pg.db.select().from(tables.rentalBillMeterIntervals);
        for (const execute of [
          () => a.get(RentalCashService).recordReceipt(fixture.auth, receipt),
          () =>
            a.get(BillRevisionsService).adjust(fixture.auth, {
              ...revision,
              expectedVersion: revisedVersion,
              idempotencyKey: randomUUID(),
            }),
          () =>
            a.get(RentalSettlementsService).confirm(fixture.auth, {
              ...input,
              expectedVersion: settlementVersion,
              idempotencyKey: randomUUID(),
            }),
        ]) {
          const spy = vi
            .spyOn(a.get(AuditService), "appendRequired")
            .mockRejectedValueOnce(new Error("测试必需审计失败"));
          try {
            await expect(execute()).rejects.toThrow("测试必需审计失败");
          } finally {
            spy.mockRestore();
          }
          expect(await counts(pg.db)).toEqual(before);
          expect(await pg.db.select().from(tables.rentalBills)).toEqual(bills);
          expect(await pg.db.select().from(tables.rentalMeterReadings)).toEqual(readings);
          expect(await pg.db.select().from(tables.rentalBillMeterIntervals)).toEqual(intervals);
        }
      }),
    120000,
  );

  it.skipIf(!url)(
    "未来账单先释放区间再撤回，历史价P→T转移并重接E，现金只计一次",
    async () =>
      scenario(async ({ pg, a, fixture }) => {
        const target = { kind: "bill" as const, billId: fixture.ids.february };
        await a.get(RentalCashService).recordReceipt(fixture.auth, {
          target,
          amountMinor: 1,
          expectedVersion: await cashVersion(a, pg.db, fixture, target),
          ...intent(),
        });
        const oldBill = await pg.db
          .select()
          .from(tables.rentalBills)
          .where(eq(tables.rentalBills.id, fixture.ids.february));
        const oldLines = await pg.db
          .select()
          .from(tables.rentalBillLines)
          .where(eq(tables.rentalBillLines.billId, fixture.ids.february));
        const oldCash = await pg.db.select().from(tables.rentalCashEntries);
        const input = {
          contractId: fixture.scope.contractId,
          extraFees: [],
          finalReadings: [
            { kind: "water" as const, readingDate: "2026-01-15", reading: "105" },
            { kind: "electricity" as const, readingDate: "2026-01-15", reading: "50" },
          ],
        };
        const service = a.get(RentalSettlementsService);
        const preview = await service.preview(fixture.auth, input);
        expect(preview.canConfirm).toBe(true);
        const before = await counts(pg.db);
        const originalReadings = await pg.db.select().from(tables.rentalMeterReadings);
        const originalIntervals = await pg.db.select().from(tables.rentalBillMeterIntervals);
        const request = {
          ...input,
          expectedVersion: preview.version,
          idempotencyKey: randomUUID(),
        };
        const failure = vi
          .spyOn(a.get(AuditService), "appendRequired")
          .mockRejectedValueOnce(new Error("未来区间转移后回滚"));
        try {
          await expect(service.confirm(fixture.auth, request)).rejects.toThrow(
            "未来区间转移后回滚",
          );
        } finally {
          failure.mockRestore();
        }
        expect(await counts(pg.db)).toEqual(before);
        expect(await pg.db.select().from(tables.rentalMeterReadings)).toEqual(originalReadings);
        expect(await pg.db.select().from(tables.rentalBillMeterIntervals)).toEqual(
          originalIntervals,
        );
        expect(
          await pg.db
            .select()
            .from(tables.rentalBills)
            .where(eq(tables.rentalBills.id, fixture.ids.february)),
        ).toEqual(oldBill);
        const settlement = await service.confirm(fixture.auth, request);
        expect(settlement).toMatchObject({
          finalCostMinor: 5839,
          balance: { receivedMinor: 1, outstandingMinor: 5838 },
        });
        const withdrawn = await pg.db
          .select()
          .from(tables.rentalBills)
          .where(eq(tables.rentalBills.id, fixture.ids.february));
        expect(withdrawn[0]).toMatchObject({
          id: fixture.ids.february,
          status: "voided",
          amountMinor: 0,
          revision: 2,
          dueDate: oldBill[0]?.dueDate,
        });
        expect(
          await pg.db
            .select()
            .from(tables.rentalBillLines)
            .where(eq(tables.rentalBillLines.billId, fixture.ids.february)),
        ).toHaveLength(0);
        const endingLines = await pg.db
          .select()
          .from(tables.rentalBillLines)
          .where(eq(tables.rentalBillLines.billId, fixture.ids.january));
        expect(endingLines.find((line) => line.kind === "water")).toMatchObject({
          amountMinor: 1000,
          feeSnapshot: {
            unitPrice: "2.0000",
            startReadingId: fixture.readings[0]?.id,
            endReading: "105.0000",
          },
        });
        expect(endingLines.some((line) => line.kind === "extra_fee")).toBe(false);
        const readings = await pg.db.select().from(tables.rentalMeterReadings);
        const terminal = readings.find(
          (reading) => reading.kind === "water" && reading.readingDate === "2026-01-15",
        );
        expect(terminal?.predecessorId).toBe(fixture.readings[0]?.id);
        expect(
          readings.find((reading) => reading.id === fixture.readings[2]?.id)?.predecessorId,
        ).toBe(terminal?.id);
        expect(await pg.db.select().from(tables.rentalCashEntries)).toEqual(oldCash);
        const history = await pg.db
          .select()
          .from(tables.rentalBillRevisions)
          .where(eq(tables.rentalBillRevisions.billId, fixture.ids.february));
        expect(history).toHaveLength(1);
        expect(history[0]?.linesSnapshot).toHaveLength(oldLines.length);
        expect(history[0]?.linesSnapshot).toEqual(expect.arrayContaining(oldLines));
        const after = await counts(pg.db);
        expect(await service.confirm(fixture.auth, request)).toEqual(settlement);
        expect(await counts(pg.db)).toEqual(after);
      }, true),
    120000,
  );
});
