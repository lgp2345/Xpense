import { describe, expect, it } from "vitest";
import { rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { buildPeriodBillContext, buildPeriodBillPlan } from "./period-bill-plan.rules.js";

const request = {
  contractId: rentalFinanceSnapshot().context.contractId,
  periodStart: "2026-01-01",
  extraFees: [],
};
describe("下一账期预览", () => {
  it("空读数返回缺项而默认到期日为期初", () => {
    const plan = buildPeriodBillPlan(rentalFinanceSnapshot(), request);
    expect(plan.missingFields).toEqual(["waterReading", "electricityReading"]);
    expect(plan.dueDate).toBe("2026-01-01");
    expect(plan.defaultReadings.map((item) => item.reading)).toEqual(["100", "50"]);
  });
  it("接续从10月并只收起算后的60用量", () => {
    const source = rentalFinanceSnapshot();
    const readings = [
      { kind: "water" as const, reading: "4200" },
      { kind: "electricity" as const, reading: "50" },
    ];
    const plan = buildPeriodBillPlan(source, {
      ...request,
      periodStart: "2026-10-01",
      billingStart: { firstPeriodStart: "2026-10-01", baselineReadings: readings },
      readings: readings.map((item) => ({
        ...item,
        reading: item.kind === "water" ? "4260" : item.reading,
      })),
    });
    expect(plan.lines.find((line) => line.kind === "water")?.amountMinor).toBe(18000);
    expect(plan.billingStart?.firstPeriodStart).toBe("2026-10-01");
  });
  it("接续缺基准不能确认，即使有入住底数", () => {
    const plan = buildPeriodBillPlan(rentalFinanceSnapshot(), {
      ...request,
      periodStart: "2026-10-01",
      billingStart: { firstPeriodStart: "2026-10-01", baselineReadings: [] },
    });
    expect(plan.missingFields).toContain("waterBaseline");
  });
  it("禁用代收不要求读数，手动到期日保持", () => {
    const source = rentalFinanceSnapshot();
    source.terms!.waterCollectionEnabled = false;
    source.terms!.electricityCollectionEnabled = false;
    const plan = buildPeriodBillPlan(source, { ...request, dueDate: "2026-08-30" });
    expect(plan.missingFields).toEqual([]);
    expect(plan.dueDate).toBe("2026-08-30");
  });
  it("相同输入版本稳定，来源变化改变版本", () => {
    const source = rentalFinanceSnapshot();
    expect(buildPeriodBillPlan(source, request).version).toBe(
      buildPeriodBillPlan(source, request).version,
    );
    const version = buildPeriodBillPlan(source, request).version;
    source.terms!.waterUnitPrice = "4";
    expect(buildPeriodBillPlan(source, request).version).not.toBe(version);
  });
  it("首期和后续账期只需读数，金额继续按有效前驱差额计算", () => {
    const source = rentalFinanceSnapshot();
    source.contract.paymentIntervalMonths = 1;
    const input = {
      ...request,
      readings: source.readings.map(({ kind, reading }) => ({
        kind,
        reading,
      })),
    };
    const first = buildPeriodBillPlan(source, input);
    expect(first.missingFields).toEqual([]);
    expect(first.lines.find((line) => line.kind === "water")?.amountMinor).toBe(0);
    const persistedReadings = Object.values(first.intervals).flatMap((interval) =>
      interval
        ? [{ ...interval.current, id: `saved-${interval.current.kind}`, billId: "jan" }]
        : [],
    );
    source.readings.push(...persistedReadings);
    const persistedLines = first.lines.map((line) =>
      line.feeSnapshot?.kind === "water" || line.feeSnapshot?.kind === "electricity"
        ? {
            ...line,
            feeSnapshot: {
              ...line.feeSnapshot,
              endReadingId: `saved-${line.kind}`,
            },
          }
        : line,
    );
    source.bills.push({
      id: "jan",
      type: "period",
      status: "active",
      periodStart: first.period.periodStart,
      periodEnd: first.period.periodEnd,
      lines: persistedLines,
      amountMinor: first.amountMinor,
    } as never);
    const later = buildPeriodBillPlan(source, {
      ...input,
      periodStart: "2026-02-01",
      readings: input.readings.map((item) => ({
        ...item,
        reading: item.kind === "water" ? "125" : "55",
      })),
    });
    expect(later.lines.find((line) => line.kind === "water")?.amountMinor).toBe(7500);
  });
  it("已保存接续后不接受再次设置，已结算拒绝出账", () => {
    const source = rentalFinanceSnapshot();
    source.billingStart = {
      id: "start",
      organizationId: source.context.organizationId,
      contractId: source.context.contractId,
      firstPeriodStart: "2026-01-01",
      version: 1,
      baselineReadings: [],
    };
    expect(() =>
      buildPeriodBillPlan(source, {
        ...request,
        billingStart: { firstPeriodStart: "2026-01-01", baselineReadings: [] },
      }),
    ).toThrow(/起点/);
    source.settlement = { id: "settlement" } as never;
    expect(() => buildPeriodBillPlan(source, request)).toThrow(/结算/);
  });
});
it("未来合同用今天真实底数提前生成首期，以基准日期限制下界", () => {
  const source = rentalFinanceSnapshot();
  source.context.today = "2026-10-08";
  Object.assign(source.contract, {
    startDate: "2026-10-15",
    endDate: "2027-01-14",
    actualEndDate: "2027-01-14",
    billingAnchor: "contract_start",
    paymentIntervalMonths: 1,
  });
  const context = buildPeriodBillContext(source);
  const input = {
    contractId: source.context.contractId,
    periodStart: context.nextPeriod!.periodStart,
    readings: context.defaultReadings,
    extraFees: [],
  };
  const plan = buildPeriodBillPlan(source, input);
  expect(plan.missingFields).toEqual([]);
  expect(plan.period.periodStart).toBe("2026-10-15");
  expect(
    plan.lines
      .filter((line) => line.kind === "water" || line.kind === "electricity")
      .map((line) => line.amountMinor),
  ).toEqual([0, 0]);
  expect(() =>
    buildPeriodBillPlan(source, {
      ...input,
      periodStart: "2026-11-15",
      billingStart: { firstPeriodStart: "2026-11-15", baselineReadings: context.defaultReadings },
    }),
  ).not.toThrow();
});
