import { expect, it } from "vitest";
import { rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { buildPeriodBillPlan } from "./period-bill-plan.rules.js";
import { buildPeriodSettlementPlan } from "./period-settlement.rules.js";

function source() {
  const value = rentalFinanceSnapshot();
  value.contract = {
    ...value.contract,
    startDate: "2026-10-05",
    endDate: "2026-12-04",
    actualEndDate: "2026-12-04",
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
    lifecycleStatus: "terminated",
    terminationDate: "2026-12-04",
  };
  value.context.today = "2026-12-04";
  value.readings = value.readings.map((reading) => ({
    ...reading,
    reading: reading.kind === "water" ? "3500" : "50",
  }));
  value.terms!.fixedFees = [{ id: "fee", name: "管理费", periodAmountMinor: 10000 }];
  return value;
}
it("尾期只收最后有效账单之后20水量，不改普通账单", () => {
  const value = source();
  const plan = buildPeriodBillPlan(value, {
    contractId: value.context.contractId,
    periodStart: "2026-10-05",
    readings: value.readings.map(({ kind, reading }) => ({
      kind,
      reading: kind === "water" ? "3680" : reading,
    })),
    extraFees: [],
  });
  value.readings.push(
    ...Object.values(plan.intervals).flatMap((interval) =>
      interval ? [{ ...interval.current, billId: "bill" }] : [],
    ),
  );
  value.bills = [
    {
      id: "bill",
      type: "period",
      status: "active",
      periodStart: plan.period.periodStart,
      periodEnd: plan.period.periodEnd,
      lines: plan.lines,
      amountMinor: plan.amountMinor,
    },
  ] as never;
  value.terms!.waterUnitPrice = "4";
  const before = structuredClone(value.bills);
  const final = buildPeriodSettlementPlan(value, {
    contractId: value.context.contractId,
    finalReadings: [
      { kind: "water", reading: "3700" },
      { kind: "electricity", reading: "50" },
    ],
    extraFees: [],
  });
  expect(final.terminalLines.find((line) => line.kind === "water")?.amountMinor).toBe(8000);
  expect(value.bills).toEqual(before);
});
it("接续不补历史月份，每期固定费保留，手动退款只影响成本", () => {
  const value = source();
  value.contract.startDate = "2026-07-05";
  value.billingStart = {
    id: "start",
    organizationId: value.context.organizationId,
    contractId: value.context.contractId,
    firstPeriodStart: "2026-10-05",
    version: 1,
    baselineReadings: value.readings.map((reading) => ({
      ...reading,
      source: "billing_start",
      billingStartId: "start",
    })),
  };
  const request = {
    contractId: value.context.contractId,
    finalReadings: value.readings.map(({ kind, reading }) => ({
      kind,
      reading,
    })),
    extraFees: [],
  };
  const first = buildPeriodSettlementPlan(value, request);
  const refund = buildPeriodSettlementPlan(value, {
    ...request,
    extraFees: [{ id: "refund", name: "固定费退款事项", amountMinor: -2000, note: "房东核定" }],
  });
  expect(first.periodCharges.map((item) => item.period.periodStart)).toEqual([
    "2026-10-05",
    "2026-11-05",
  ]);
  expect(refund.finalCostMinor).toBe(first.finalCostMinor - 2000);
  expect(value.cashEntries).toEqual([]);
});
it("未来已出账固定费不自动退，未来未出账不补固定费", () => {
  const value = source();
  value.contract.terminationDate = "2026-10-20";
  value.bills = [
    {
      id: "future",
      type: "period",
      status: "active",
      periodStart: "2026-11-05",
      periodEnd: "2026-12-04",
      amountMinor: 310000,
      lines: [
        {
          kind: "fixed_fee",
          label: "管理费",
          amountMinor: 10000,
          feeSnapshot: { kind: "fixed_fee", periodAmountMinor: 10000 },
        },
      ],
    },
  ] as never;
  const plan = buildPeriodSettlementPlan(value, {
    contractId: value.context.contractId,
    finalReadings: [],
    extraFees: [],
  });
  expect(plan.periodCharges.find((item) => item.billId === "future")?.amountMinor).toBe(10000);
  expect(plan.periodCharges).toHaveLength(2);
});
it("同值终读数零收费，低于有效基准拒绝", () => {
  const value = source();
  const dto = {
    contractId: value.context.contractId,
    finalReadings: value.readings.map(({ kind, reading }) => ({
      kind,
      reading,
    })),
    extraFees: [],
  };
  expect(
    buildPeriodSettlementPlan(value, dto).terminalLines.every((line) => line.amountMinor === 0),
  ).toBe(true);
  expect(() =>
    buildPeriodSettlementPlan(value, {
      ...dto,
      finalReadings: [{ kind: "water", reading: "3499" }],
    }),
  ).toThrow(/读数/);
});
it("结算事项标识不得重复或覆盖仍有效账单事项", () => {
  const value = source();
  const fee = { id: "same", name: "管理费退款", amountMinor: -1, note: "核定" };
  const input = { contractId: value.context.contractId, finalReadings: [], extraFees: [fee, fee] };
  expect(() => buildPeriodSettlementPlan(value, input)).toThrow(/标识/);
  value.bills = [
    {
      id: "bill",
      type: "period",
      status: "active",
      periodStart: "2026-10-05",
      periodEnd: "2026-11-04",
      lines: [
        {
          kind: "extra_fee",
          label: "维修费",
          amountMinor: 100,
          feeSnapshot: { kind: "extra_fee", extraFeeId: fee.id, origin: "period" },
        },
      ],
    },
  ] as never;
  expect(() => buildPeriodSettlementPlan(value, { ...input, extraFees: [fee] })).toThrow(/标识/);
  value.bills[0]!.status = "voided";
  expect(() =>
    buildPeriodSettlementPlan(value, { ...input, extraFees: [{ ...fee, amountMinor: 1 }] }),
  ).not.toThrow();
});
