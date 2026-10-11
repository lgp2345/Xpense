import type { INestApplicationContext } from "@nestjs/common";
import type { RentalBillDetail } from "@xpense/shared";
import { expect, it, vi } from "vitest";
import { BillsReadService } from "../modules/rental/bills-read.service.js";
import { ChargeTermsService } from "../modules/rental/charge-terms.service.js";
import {
  buildPeriodBillContext,
  buildPeriodBillPlan,
} from "../modules/rental/period-bill-plan.rules.js";
import { PeriodBillsService } from "../modules/rental/period-bills.service.js";
import { RentalCashService } from "../modules/rental/rental-cash.service.js";
import { rentalFinanceAuth, rentalFinanceSnapshot } from "../test/rental-finance-fixtures.js";
import { DB } from "./db.tokens.js";
import { seedPeriodFinance } from "./seed-local-rental-period-finance.js";

it("跨日恢复沿用有效账单读数且不重复已完成账单", async () => {
  const source = rentalFinanceSnapshot();
  source.context.today = "2026-10-09";
  Object.assign(source.contract, {
    startDate: "2026-08-05",
    endDate: "2026-10-07",
    actualEndDate: "2026-10-07",
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
  });
  source.readings = source.readings.map((r) => ({
    ...r,
    reading: r.kind === "water" ? "3500" : "50",
  }));
  const first = buildPeriodBillPlan(source, {
    contractId: source.context.contractId,
    periodStart: "2026-08-05",
    readings: source.readings.map(({ kind, reading }) => ({
      kind,
      reading: kind === "water" ? "3600" : reading,
    })),
    extraFees: [],
  });
  const lines = first.lines.map((line) => ({
    ...line,
    feeSnapshot:
      line.feeSnapshot &&
      (line.feeSnapshot.kind === "water" || line.feeSnapshot.kind === "electricity")
        ? { ...line.feeSnapshot, endReadingId: `first-${line.kind}` }
        : line.feeSnapshot,
  }));
  source.bills = [
    {
      id: "first",
      type: "period",
      status: "active",
      periodStart: first.period.periodStart,
      periodEnd: first.period.periodEnd,
      lines,
      amountMinor: first.amountMinor,
    },
  ] as RentalBillDetail[];
  source.readings.push(
    ...Object.values(first.intervals).flatMap((interval) =>
      interval
        ? [{ ...interval.current, id: `first-${interval.current.kind}`, billId: "first" }]
        : [],
    ),
  );
  source.billingStart = {
    id: "start",
    organizationId: source.context.organizationId,
    contractId: source.context.contractId,
    firstPeriodStart: "2026-08-05",
    version: 1,
    baselineReadings: [],
  };
  const where = vi
    .fn()
    .mockResolvedValueOnce([{ result: { resourceId: "first" } }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ result: { resourceId: "first" } }])
    .mockResolvedValueOnce([{ result: { resourceId: "second" } }]);
  const db = { select: () => ({ from: () => ({ where }) }) };
  const periods = {
    context: vi.fn(async () => buildPeriodBillContext(source, { page: 1, pageSize: 100 })),
    preview: vi.fn(async (_auth, input: Parameters<typeof buildPeriodBillPlan>[1]) =>
      buildPeriodBillPlan(source, input),
    ),
    generate: vi.fn(async () => ({ id: "second" })),
  };
  const cash = { recordReceipt: vi.fn() };
  const details = { detail: vi.fn(async (_auth, dto: { id: string }) => ({ id: dto.id })) };
  const services = new Map<unknown, unknown>([
    [DB, db],
    [PeriodBillsService, periods],
    [RentalCashService, cash],
    [BillsReadService, details],
    [ChargeTermsService, {}],
  ]);
  const app = { get: (token: unknown) => services.get(token) } as INestApplicationContext;
  await seedPeriodFinance(
    app,
    rentalFinanceAuth as never,
    source.context.contractId,
    "settlement-ready",
    "2026-10-09",
  );
  expect(periods.generate).toHaveBeenCalledOnce();
  expect(periods.generate).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      periodStart: "2026-09-05",
      readings: [
        { kind: "water", reading: "3680" },
        { kind: "electricity", reading: "50" },
      ],
    }),
  );
  await seedPeriodFinance(
    app,
    rentalFinanceAuth as never,
    source.context.contractId,
    "settlement-ready",
    "2026-10-10",
  );
  expect(periods.generate).toHaveBeenCalledOnce();
  expect(cash.recordReceipt).not.toHaveBeenCalled();
});
