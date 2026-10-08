import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ContractsPolicyService } from "../modules/rental/contracts-policy.service.js";
import { PeriodBillVoidService } from "../modules/rental/period-bill-void.service.js";
import { PeriodBillsService } from "../modules/rental/period-bills.service.js";
import { RentalCashService } from "../modules/rental/rental-cash.service.js";
import { rentalCashSourceVersion } from "../modules/rental/rental-cash.version.rules.js";
import { RentalCashProjectionRepository } from "../modules/rental/rental-cash-projection.repository.js";
import { financeSourceVersion } from "../modules/rental/rental-finance-request.rules.js";
import { RentalFinanceSourceService } from "../modules/rental/rental-finance-source.service.js";
import { RentalSettlementsService } from "../modules/rental/rental-settlements.service.js";
import { rentalTestDatabaseUrl } from "../test/rental-postgres-corpus.js";
import { insertRentalPostgresFixture } from "../test/rental-postgres-fixtures.js";
import { withRentalPostgres } from "../test/rental-postgres-harness.js";
import { createRentalPostgresServices } from "../test/rental-postgres-services.js";
import * as tables from "./schema.js";

const url = rentalTestDatabaseUrl(process.env);

describe("真实账期并发", () => {
  it.skipIf(!url).each(["不同键", "同键", "生成与作废", "作废与收款", "出账与结算"])(
    "%s保持串行事实",
    async (kind) => {
      if (!url) throw new Error("隔离数据库未配置");
      await withRentalPostgres(url, async (pg) => {
        await pg.applyMigrations();
        const fixture = await insertRentalPostgresFixture(pg.db, false, false, true);
        const worker = await pg.connect();
        const observer = await pg.connect();
        expect(new Set([pg.pid, worker.pid, observer.pid]).size).toBe(3);
        const a = await createRentalPostgresServices(pg.db);
        const b = await createRentalPostgresServices(worker.db);
        try {
          const periodInput = async () => {
            const context = await a.get(PeriodBillsService).context(fixture.auth, {
              contractId: fixture.scope.contractId,
              page: 1,
              pageSize: 20,
            });
            const input = {
              contractId: fixture.scope.contractId,
              periodStart: context.nextPeriod!.periodStart,
              dueDate: context.defaultDueDate!,
              readings: context.defaultReadings,
              extraFees: [],
            };
            const preview = await a.get(PeriodBillsService).preview(fixture.auth, input);
            return { ...input, expectedVersion: preview.version, idempotencyKey: randomUUID() };
          };
          let existingId: string | undefined;
          if (["生成与作废", "作废与收款", "出账与结算"].includes(kind))
            existingId = (
              await a.get(PeriodBillsService).generate(fixture.auth, await periodInput())
            ).id;
          const generation = await periodInput();
          const source = await a.get(RentalFinanceSourceService).read(fixture.scope, pg.db);
          const voidInput = {
            billId: existingId!,
            reason: "竞争验收",
            expectedVersion: financeSourceVersion(source, { billId: existingId }),
            idempotencyKey: randomUUID(),
          };
          let first: () => Promise<unknown> = () =>
            a.get(PeriodBillsService).generate(fixture.auth, generation);
          let second: () => Promise<unknown> = () =>
            b.get(PeriodBillsService).generate(fixture.auth, {
              ...generation,
              idempotencyKey: kind === "同键" ? generation.idempotencyKey : randomUUID(),
            });
          if (kind === "生成与作废")
            second = () => b.get(PeriodBillVoidService).void(fixture.auth, voidInput);
          if (kind === "作废与收款") {
            first = () => a.get(PeriodBillVoidService).void(fixture.auth, voidInput);
            const target = { kind: "bill" as const, billId: existingId! };
            const [facts] = await a
              .get(RentalCashProjectionRepository)
              .readMany(fixture.organizationId, [fixture.scope.contractId], pg.db);
            if (!facts) throw new Error("资金来源缺失");
            const cash = {
              target,
              amountMinor: 100,
              occurredOn: "2026-02-28",
              expectedVersion: rentalCashSourceVersion(facts, target),
              idempotencyKey: randomUUID(),
            };
            second = () => b.get(RentalCashService).recordReceipt(fixture.auth, cash);
          }
          if (kind === "出账与结算") {
            const input = {
              contractId: fixture.scope.contractId,
              extraFees: [],
              finalReadings: source.readings
                .filter((r) => r.source === "contract")
                .map(({ kind, reading }) => ({ kind, reading, readingDate: "2026-02-28" })),
            };
            const preview = await a.get(RentalSettlementsService).preview(fixture.auth, input);
            expect(preview.canConfirm).toBe(true);
            second = () =>
              b.get(RentalSettlementsService).confirm(fixture.auth, {
                ...input,
                expectedVersion: preview.version,
                idempotencyKey: randomUUID(),
              });
          }
          let held!: () => void;
          let release!: () => void;
          const acquired = new Promise<void>((resolve) => {
            held = resolve;
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
              held();
              await gate;
              return result;
            });
          const outcome = (call: () => Promise<unknown>) =>
            call().then(
              (value) => ({ value, error: null }),
              (error) => ({ value: null, error: error as unknown }),
            );
          const left = outcome(first);
          let right: ReturnType<typeof outcome> | undefined;
          let blocked = false;
          try {
            await Promise.race([
              acquired,
              left.then(() => {
                throw new Error("首请求未进入实际锁");
              }),
            ]);
            right = outcome(second);
            for (const deadline = Date.now() + 5000; Date.now() < deadline; ) {
              const [activity] =
                await observer.client`SELECT wait_event_type FROM pg_stat_activity WHERE pid=${worker.pid}`;
              if (activity?.wait_event_type === "Lock") {
                blocked = true;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          } finally {
            release();
            spy.mockRestore();
          }
          const outcomes = await Promise.all([left, right]);
          expect(blocked, "独立数据库连接确实等待写锁").toBe(true);
          expect(outcomes.filter((r) => r?.error === null)).toHaveLength(kind === "同键" ? 2 : 1);
          if (kind === "同键") expect(outcomes[0]?.value).toEqual(outcomes[1]?.value);
          else {
            const error = outcomes[1]?.error;
            expect(error).toBeInstanceOf(HttpException);
            expect((error as HttpException).getStatus()).toBe(409);
          }
          const bills = await pg.db.select().from(tables.rentalBills);
          const readings = await pg.db.select().from(tables.rentalMeterReadings);
          const intervals = await pg.db.select().from(tables.rentalBillMeterIntervals);
          const starts = await pg.db.select().from(tables.rentalBillingStarts);
          const requests = await pg.db.select().from(tables.rentalFinanceRequests);
          const audits = await pg.db.select().from(tables.auditLogs);
          const cash = await pg.db.select().from(tables.rentalCashEntries);
          const settlements = await pg.db.select().from(tables.rentalSettlements);
          const generated = ["生成与作废", "出账与结算"].includes(kind) ? 2 : 1;
          expect(bills).toHaveLength(generated);
          expect(readings).toHaveLength(2 + generated * 2);
          expect(intervals).toHaveLength(generated * 2);
          expect(starts).toHaveLength(1);
          expect(cash).toHaveLength(0);
          expect(settlements).toHaveLength(0);
          expect(requests).toHaveLength(kind === "作废与收款" ? 2 : generated);
          expect(audits).toHaveLength(requests.length);
          expect(bills.filter((bill) => bill.status === "active")).toHaveLength(
            kind === "作废与收款" ? 0 : generated,
          );
          for (const interval of intervals) {
            const end = readings.find((r) => r.id === interval.endReadingId)!;
            expect(end.billId).toBe(interval.billId);
            expect(end.predecessorId).toBe(interval.startReadingId);
          }
          const final = await a.get(RentalFinanceSourceService).read(fixture.scope, pg.db);
          const context = await a
            .get(PeriodBillsService)
            .context(fixture.auth, { contractId: fixture.scope.contractId, page: 1, pageSize: 20 });
          if (kind === "作废与收款")
            expect(context.baselineReadings.map((r) => r.reading)).toEqual(
              final.readings.filter((r) => r.source === "contract").map((r) => r.reading),
            );
        } finally {
          await a.close();
          await b.close();
        }
      });
    },
    120000,
  );
});
