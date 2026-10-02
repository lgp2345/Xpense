import { describe, expect, it } from "vitest";

import { financeContractId, rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { buildMonthlyBillPlan, MonthlyBillPlanError } from "./monthly-bill-plan.rules.js";

const request = {
  contractId: financeContractId,
  billingMonth: "2026-08",
  extraFees: [],
};

describe("月度账单计划规则", () => {
  it.each([
    [true, true, 2],
    [true, false, 1],
    [false, true, 1],
    [false, false, 0],
  ])("仅代收项目计量 %s/%s", (water, electricity, count) => {
    const snapshot = rentalFinanceSnapshot();
    if (!snapshot.terms) throw new Error("缺少标准");
    snapshot.terms.waterCollectionEnabled = water;
    snapshot.terms.electricityCollectionEnabled = electricity;
    const readings = [
      { kind: "water" as const, readingDate: "2026-08-31", reading: "120" },
      { kind: "electricity" as const, readingDate: "2026-08-31", reading: "60" },
    ].filter(({ kind }) => (kind === "water" ? water : electricity));
    const plan = buildMonthlyBillPlan(snapshot, { ...request, dueDate: "2026-08-31", readings });
    expect(plan.missingFields).toEqual([]);
    expect(
      plan.lines.filter(({ kind }) => kind === "water" || kind === "electricity"),
    ).toHaveLength(count);
    if (!water) expect(plan.intervals.water).toBeNull();
    if (!electricity) expect(plan.intervals.electricity).toBeNull();
  });

  it("不代收的意外输入不产生读数写入，零底数有效", () => {
    const snapshot = rentalFinanceSnapshot();
    if (!snapshot.terms) throw new Error("缺少标准");
    snapshot.terms.electricityCollectionEnabled = false;
    snapshot.readings = snapshot.readings
      .filter(({ kind }) => kind === "water")
      .map((reading) => ({ ...reading, reading: "0" }));
    const plan = buildMonthlyBillPlan(snapshot, {
      ...request,
      dueDate: "2026-08-31",
      readings: [
        { kind: "water", readingDate: "2026-08-31", reading: "10" },
        { kind: "electricity", readingDate: "2026-08-31", reading: "99" },
      ],
    });
    expect(plan.missingFields).toEqual([]);
    expect(plan.intervals.electricity).toBeNull();
    expect(plan.lines.find(({ kind }) => kind === "water")?.amountMinor).toBe(3000);
  });

  it("缺少截止日和读数时保留可预览结果并列出缺项", () => {
    const plan = buildMonthlyBillPlan(rentalFinanceSnapshot(), request);

    expect(plan.missingFields).toEqual(
      expect.arrayContaining(["dueDate", "waterReading", "electricityReading"]),
    );
    expect(plan.lines.some((line) => line.kind === "fixed_fee")).toBe(true);
  });

  it("拒绝超出合同日期范围的出账月份", () => {
    expect(() =>
      buildMonthlyBillPlan(rentalFinanceSnapshot(), {
        ...request,
        billingMonth: "2025-12",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<MonthlyBillPlanError>>({
        kind: "bad_request",
        message: "出账月份不在合同实际租期内",
      }),
    );
  });

  it("拒绝重复使用账单历史中已结算的水电读数区间", () => {
    const snapshot = rentalFinanceSnapshot();
    const waterBaseline = snapshot.readings.find((reading) => reading.kind === "water");
    const electricityBaseline = snapshot.readings.find((reading) => reading.kind === "electricity");
    if (!waterBaseline || !electricityBaseline) throw new Error("Expected seeded meter baselines");
    const waterBoundary = {
      id: "00000000-0000-4000-8000-000000000099",
      contractId: financeContractId,
      spaceId: waterBaseline.spaceId,
      kind: "water" as const,
      readingDate: "2026-08-31",
      reading: "120",
      revision: 1,
      predecessorId: waterBaseline.id,
    };
    snapshot.readings.push(waterBoundary);
    snapshot.bills.push({
      id: "00000000-0000-4000-8000-000000000098",
      contractId: financeContractId,
      type: "deposit",
      status: "active",
      lines: [
        {
          kind: "water",
          feeSnapshot: {
            kind: "water",
            startReadingId: waterBaseline.id,
            endReadingId: waterBoundary.id,
            startDate: waterBaseline.readingDate,
            endDate: waterBoundary.readingDate,
            startReading: waterBaseline.reading,
            endReading: waterBoundary.reading,
            unitPrice: "3.0000",
            overrideReason: null,
          },
        },
      ],
    } as never);

    expect(() =>
      buildMonthlyBillPlan(snapshot, {
        ...request,
        dueDate: "2026-08-31",
        readings: [
          { kind: "water", readingDate: waterBoundary.readingDate, reading: waterBoundary.reading },
          {
            kind: "electricity",
            readingDate: "2026-08-31",
            reading: "60",
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<MonthlyBillPlanError>>({
        kind: "conflict",
        message: "该水电计费区间已用于历史账单",
      }),
    );
  });

  it("拒绝在已存在的较晚水电边界之前新增读数", () => {
    const snapshot = rentalFinanceSnapshot();
    const waterBaseline = snapshot.readings.find((reading) => reading.kind === "water");
    if (!waterBaseline) throw new Error("Expected seeded water baseline");
    snapshot.readings.push({
      id: "00000000-0000-4000-8000-000000000099",
      contractId: financeContractId,
      spaceId: waterBaseline.spaceId,
      kind: "water",
      readingDate: "2026-08-31",
      reading: "120",
      revision: 1,
      predecessorId: waterBaseline.id,
    });

    expect(() =>
      buildMonthlyBillPlan(snapshot, {
        ...request,
        billingMonth: "2026-06",
        dueDate: "2026-06-30",
        readings: [
          { kind: "water", readingDate: "2026-06-30", reading: "110" },
          { kind: "electricity", readingDate: "2026-06-30", reading: "60" },
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<MonthlyBillPlanError>>({
        kind: "conflict",
        message: "新抄表读数只能延续当前水电表计链尾",
      }),
    );
  });

  it("允许预览已有的非链尾边界与对应的已出账月份", () => {
    const snapshot = rentalFinanceSnapshot();
    const waterBaseline = snapshot.readings.find((reading) => reading.kind === "water");
    if (!waterBaseline) throw new Error("Expected seeded water baseline");
    const waterBoundary = {
      id: "00000000-0000-4000-8000-000000000099",
      contractId: financeContractId,
      spaceId: waterBaseline.spaceId,
      kind: "water" as const,
      readingDate: "2026-08-31",
      reading: "120",
      revision: 1,
      predecessorId: waterBaseline.id,
    };
    snapshot.readings.push(waterBoundary, {
      ...waterBoundary,
      id: "00000000-0000-4000-8000-000000000100",
      readingDate: "2026-09-30",
      reading: "130",
      predecessorId: waterBoundary.id,
    });
    snapshot.bills.push({
      id: "00000000-0000-4000-8000-000000000098",
      type: "monthly",
      status: "active",
      modelVersion: 2,
      billingMonth: "2026-08",
      sourceKey: "monthly:2026-08",
      lines: [
        {
          kind: "water",
          feeSnapshot: {
            kind: "water",
            startReadingId: waterBaseline.id,
            endReadingId: waterBoundary.id,
            startDate: waterBaseline.readingDate,
            endDate: waterBoundary.readingDate,
            startReading: waterBaseline.reading,
            endReading: waterBoundary.reading,
            unitPrice: "3.0000",
            overrideReason: null,
          },
        },
      ],
    } as never);

    const plan = buildMonthlyBillPlan(snapshot, {
      ...request,
      dueDate: "2026-08-31",
      readings: [
        { kind: "water", readingDate: waterBoundary.readingDate, reading: waterBoundary.reading },
        { kind: "electricity", readingDate: "2026-08-31", reading: "60" },
      ],
    });

    expect(plan.existingBill?.id).toBe("00000000-0000-4000-8000-000000000098");
    expect(plan.intervals.water).toMatchObject({
      current: { id: waterBoundary.id },
      pending: false,
    });
  });
});
