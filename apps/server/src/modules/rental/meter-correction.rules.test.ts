import type {
  RentalBillDetail,
  RentalBillLine,
  RentalBillRevisionInput,
  RentalCashEntry,
} from "@xpense/shared";
import { describe, expect, it } from "vitest";
import { buildMeterCorrectionPlan } from "./meter-correction.rules.js";
import type { RentalFinanceSnapshot, RentalMeterReading } from "./rental-finance.types.js";

function reading(
  id: string,
  readingDate: string,
  value: string,
  predecessorId: string | null,
): RentalMeterReading {
  return {
    id,
    kind: "water",
    readingDate,
    reading: value,
    spaceId: "space-1",
    contractId: "contract-1",
    revision: 1,
    predecessorId,
  };
}

function bill(
  id: string,
  billingMonth: string,
  start: RentalMeterReading,
  end: RentalMeterReading,
  unitPrice: string,
  utilityAmount: number,
): RentalBillDetail {
  const lines: RentalBillLine[] = [
    {
      kind: "rent_period",
      label: "月度租金",
      amountMinor: 200_000,
      periodStart: `${billingMonth}-01`,
      periodEnd: `${billingMonth}-30`,
      referenceStart: `${billingMonth}-01`,
      referenceEnd: `${billingMonth}-30`,
      coveredDays: 30,
      referenceDays: 30,
      baseRentAmountMinor: 200_000,
      sortOrder: 0,
    },
    {
      kind: "water",
      label: "水费",
      amountMinor: utilityAmount,
      periodStart: start.readingDate,
      periodEnd: end.readingDate,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 1,
      feeSnapshot: {
        kind: "water",
        startReadingId: start.id,
        endReadingId: end.id,
        startDate: start.readingDate,
        endDate: end.readingDate,
        startReading: start.reading,
        endReading: end.reading,
        unitPrice,
        overrideReason: null,
      },
    },
  ];
  return {
    id,
    billNumber: id,
    contractId: "contract-1",
    contractNumber: "C-1",
    propertyId: "property-1",
    propertyName: "P-1",
    currencyCode: "CNY",
    type: "monthly",
    status: "active",
    sourceKey: `monthly:${billingMonth}`,
    periodStart: `${billingMonth}-01`,
    periodEnd: `${billingMonth}-30`,
    effectiveEnd: `${billingMonth}-30`,
    dueDate: `${billingMonth}-01`,
    amountMinor: 200_000 + utilityAmount,
    dueState: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    modelVersion: 2,
    billingMonth,
    revision: 1,
    lines,
    generationId: null,
    adjustmentId: null,
    adjustment: null,
    snapshot: {
      propertyId: "property-1",
      propertyName: "P-1",
      contractNumber: "C-1",
      spaces: [],
      parties: [],
    },
    voidReason: null,
    voidedAt: null,
    voidedBy: null,
    history: [],
  };
}

function snapshot(): RentalFinanceSnapshot {
  const before = reading("w-0", "2026-08-31", "90", null);
  const boundary = reading("w-1", "2026-09-30", "100", before.id);
  const after = reading("w-2", "2026-10-31", "120", boundary.id);
  const cash = {
    id: "receipt-1",
    contractId: "contract-1",
    target: { kind: "bill", billId: "bill-sep" },
    kind: "receipt",
    purpose: "bill_receipt",
    amountMinor: 200_000,
    occurredOn: "2026-09-30",
    note: null,
    createdAt: "2026-09-30T10:00:00.000Z",
    createdByUserId: "user-1",
    revokedAt: null,
    revokedByUserId: null,
    revokeReason: null,
  } as RentalCashEntry;
  return {
    context: {
      organizationId: "organization-1",
      contractId: "contract-1",
      today: "2026-10-31",
      currencyCode: "CNY",
      timezone: "Asia/Shanghai",
    },
    contract: {} as RentalFinanceSnapshot["contract"],
    terms: null,
    readings: [before, boundary, after],
    bills: [
      bill("bill-sep", "2026-09", before, boundary, "3", 3_000),
      bill("bill-oct", "2026-10", boundary, after, "4", 8_000),
    ],
    cashEntries: [cash],
    settlement: null,
    cancelledOn: null,
  };
}

function fixedSource() {
  const source = snapshot();
  for (const bill of source.bills) {
    bill.lines.push({
      kind: "fixed_fee",
      label: "管理费",
      amountMinor: 5_000,
      periodStart: "2026-09-16",
      periodEnd: "2026-09-30",
      referenceStart: "2026-09-01",
      referenceEnd: "2026-09-30",
      coveredDays: 15,
      referenceDays: 30,
      baseRentAmountMinor: null,
      sortOrder: 2,
      feeSnapshot: {
        kind: "fixed_fee",
        feeId: "management",
        monthlyAmountMinor: 5_000,
        overrideReason: null,
      },
    });
    bill.amountMinor += 5_000;
  }
  return source;
}

describe("本张账单固定费调整", () => {
  const input = { billId: "bill-sep", expectedVersion: "v", reason: "本期协商费用" };
  it.each([2_000, 0])("最终金额 %i 不再折算，保留月标准并标记手工金额", (amountMinor) => {
    const source = fixedSource();
    const before = structuredClone(source);
    const plan = buildMeterCorrectionPlan(source, {
      ...input,
      fixedFeeAdjustments: [{ feeId: "management", action: "set_amount", amountMinor }],
    });
    expect(plan.affectedBillIds).toEqual(["bill-sep"]);
    expect(plan.bills[0]?.amountMinor).toBe(203_000 + amountMinor);
    expect(plan.bills[0]?.lines.find(({ kind }) => kind === "fixed_fee")).toMatchObject({
      amountMinor,
      feeSnapshot: {
        monthlyAmountMinor: 5_000,
        calculationMode: "manual_amount",
        overrideReason: input.reason,
      },
    });
    expect(plan.readings).toEqual([]);
    expect(source).toEqual(before);
  });
  it("合同已删除标准也可删除历史账单费用，只移除目标行", () => {
    const source = fixedSource();
    source.terms = null;
    const plan = buildMeterCorrectionPlan(source, {
      ...input,
      fixedFeeAdjustments: [{ feeId: "management", action: "remove" }],
    });
    expect(plan.bills[0]?.lines.some(({ kind }) => kind === "fixed_fee")).toBe(false);
    expect(plan.bills[0]?.amountMinor).toBe(203_000);
    expect(source.bills[1]?.lines.find(({ kind }) => kind === "fixed_fee")?.amountMinor).toBe(
      5_000,
    );
  });
  it("仅调整费用不校正已保存水电金额、日期及快照", () => {
    const source = fixedSource();
    const water = source.bills[0]?.lines.find(({ kind }) => kind === "water");
    if (!water) throw new Error("missing water");
    water.amountMinor = 2_750;
    const prior = structuredClone(water);
    const plan = buildMeterCorrectionPlan(source, {
      ...input,
      fixedFeeAdjustments: [{ feeId: "management", action: "set_amount", amountMinor: 2_000 }],
    });
    expect(plan.bills[0]?.lines.find(({ kind }) => kind === "water")).toEqual(prior);
  });
  it.each([
    { adjustments: [{ feeId: "unknown", action: "remove" }] },
    {
      adjustments: [
        { feeId: "management", action: "remove" },
        { feeId: "management", action: "remove" },
      ],
    },
    { adjustments: [{ feeId: "management", action: "set_amount", amountMinor: -1 }] },
  ])("拒绝未知、重复或负数调整 %#", ({ adjustments: fixedFeeAdjustments }) => {
    expect(() =>
      buildMeterCorrectionPlan(fixedSource(), {
        ...input,
        fixedFeeAdjustments: fixedFeeAdjustments as RentalBillRevisionInput["fixedFeeAdjustments"],
      }),
    ).toThrow(RangeError);
  });
  it("拒绝同项新旧覆盖字段重叠", () => {
    expect(() =>
      buildMeterCorrectionPlan(fixedSource(), {
        ...input,
        fixedFeeAdjustments: [{ feeId: "management", action: "remove" }],
        overrides: {
          fixedFees: [{ id: "management", monthlyAmountMinor: 2_000 }],
          reason: input.reason,
        },
      }),
    ).toThrow(RangeError);
  });
  it("edit_unpaid 不能更正共享读数", () => {
    expect(() =>
      buildMeterCorrectionPlan(fixedSource(), {
        ...input,
        mode: "edit_unpaid",
        readings: [{ kind: "water", readingDate: "2026-09-30", reading: "101" }],
      }),
    ).toThrow(RangeError);
  });
  it.each([
    "full_month",
    "daily_proration",
  ] as const)("旧月额覆盖遵守保存的 %s 计算模式", (calculationMode) => {
    const source = fixedSource();
    const fee = source.bills[0]?.lines.find(({ kind }) => kind === "fixed_fee");
    if (fee?.feeSnapshot?.kind !== "fixed_fee") throw new Error("missing fixed");
    fee.feeSnapshot.calculationMode = calculationMode;
    const plan = buildMeterCorrectionPlan(source, {
      ...input,
      overrides: {
        fixedFees: [{ id: "management", monthlyAmountMinor: 2_000 }],
        reason: input.reason,
      },
    });
    expect(plan.bills[0]?.lines.find(({ kind }) => kind === "fixed_fee")?.amountMinor).toBe(
      calculationMode === "full_month" ? 2_000 : 1_000,
    );
  });
});

describe("buildMeterCorrectionPlan", () => {
  it("reprices both sides of a shared reading with each bill's saved unit price", () => {
    const source = snapshot();
    const priorCash = structuredClone(source.cashEntries);
    const plan = buildMeterCorrectionPlan(source, {
      billId: "bill-sep",
      expectedVersion: "version-1",
      readings: [{ kind: "water", readingDate: "2026-09-30", reading: "110" }],
      reason: "更正抄表值",
    });

    expect(plan.affectedBillIds).toEqual(["bill-sep", "bill-oct"]);
    expect(plan.bills.map(({ billId, amountMinor }) => [billId, amountMinor])).toEqual([
      ["bill-sep", 206_000],
      ["bill-oct", 204_000],
    ]);
    expect(
      plan.bills.map(({ lines }) => lines.find((item) => item.kind === "water")?.feeSnapshot),
    ).toMatchObject([
      { unitPrice: "3", startReading: "90", endReading: "110" },
      { unitPrice: "4", startReading: "110", endReading: "120" },
    ]);
    expect(plan.readings).toMatchObject([{ id: "w-1", reading: "110", predecessorId: "w-0" }]);
    expect(source.cashEntries).toEqual(priorCash);
    expect(source.bills[0]?.amountMinor).toBe(203_000);
  });

  it("applies a price override only to the target bill while preserving the adjacent price snapshot", () => {
    const source = snapshot();
    const adjacentWater = source.bills[1]?.lines.find((item) => item.kind === "water");
    if (adjacentWater?.feeSnapshot?.kind !== "water") throw new Error("缺少相邻水费快照");
    adjacentWater.feeSnapshot.overrideReason = "10月历史审批价";

    const plan = buildMeterCorrectionPlan(source, {
      billId: "bill-sep",
      expectedVersion: "version-1",
      readings: [{ kind: "water", readingDate: "2026-09-30", reading: "110" }],
      reason: "9月修正读数并调价",
      overrides: { waterUnitPrice: "3.5", reason: "9月单期调价" },
    });

    expect(plan.bills.map(({ billId, amountMinor }) => [billId, amountMinor])).toEqual([
      ["bill-sep", 207_000],
      ["bill-oct", 204_000],
    ]);
    expect(
      plan.bills.map(({ lines }) => lines.find((item) => item.kind === "water")?.feeSnapshot),
    ).toMatchObject([
      { unitPrice: "3.5", overrideReason: "9月单期调价", startReading: "90", endReading: "110" },
      { unitPrice: "4", overrideReason: "10月历史审批价", startReading: "110", endReading: "120" },
    ]);
  });

  it("rejects a correction that would make the adjacent meter interval negative", () => {
    expect(() =>
      buildMeterCorrectionPlan(snapshot(), {
        billId: "bill-sep",
        expectedVersion: "version-1",
        readings: [{ kind: "water", readingDate: "2026-09-30", reading: "121" }],
        reason: "超出后续读数",
      }),
    ).toThrow(RangeError);
  });

  it("updates both interval dates when the shared reading date changes", () => {
    const plan = buildMeterCorrectionPlan(snapshot(), {
      billId: "bill-sep",
      expectedVersion: "version-1",
      readings: [{ kind: "water", readingDate: "2026-10-01", reading: "110" }],
      reason: "更正抄表日期",
    });

    expect(
      plan.bills.map(({ billId, lines }) => [
        billId,
        lines.find((item) => item.kind === "water")?.periodStart,
        lines.find((item) => item.kind === "water")?.periodEnd,
      ]),
    ).toEqual([
      ["bill-sep", "2026-08-31", "2026-10-01"],
      ["bill-oct", "2026-10-01", "2026-10-31"],
    ]);
  });

  it("rejects a boundary date moved after its successor", () => {
    expect(() =>
      buildMeterCorrectionPlan(snapshot(), {
        billId: "bill-sep",
        expectedVersion: "version-1",
        readings: [{ kind: "water", readingDate: "2026-11-01", reading: "100" }],
        reason: "晚于后续读数",
      }),
    ).toThrow(RangeError);
  });

  it("replaces all extra fees while preserving each matching item's origin", () => {
    const source = snapshot();
    const target = source.bills[0];
    if (!target) throw new Error("缺少目标账单");
    target.lines.push(
      {
        kind: "extra_fee",
        label: "结算补费",
        amountMinor: 5_000,
        periodStart: null,
        periodEnd: null,
        referenceStart: null,
        referenceEnd: null,
        coveredDays: null,
        referenceDays: null,
        baseRentAmountMinor: null,
        sortOrder: 2,
        note: "退租结算费用",
        feeSnapshot: { kind: "extra_fee", extraFeeId: "settlement-extra", origin: "settlement" },
      },
      {
        kind: "extra_fee",
        label: "月度清洁费",
        amountMinor: 7_000,
        periodStart: null,
        periodEnd: null,
        referenceStart: null,
        referenceEnd: null,
        coveredDays: null,
        referenceDays: null,
        baseRentAmountMinor: null,
        sortOrder: 3,
        note: "月度附加费用",
        feeSnapshot: { kind: "extra_fee", extraFeeId: "monthly-extra", origin: "monthly" },
      },
    );
    target.amountMinor += 12_000;

    const plan = buildMeterCorrectionPlan(source, {
      billId: target.id,
      expectedVersion: "version-1",
      reason: "替换全部附加费用",
      extraFees: [
        { id: "settlement-extra", name: "更新结算费", amountMinor: 6_000, note: "保留原来源" },
        { id: "monthly-extra", name: "更新清洁费", amountMinor: 8_000, note: "新月度金额" },
      ],
    });

    expect(
      plan.bills[0]?.lines
        .filter((item) => item.kind === "extra_fee")
        .map((item) => [item.feeSnapshot, item.amountMinor]),
    ).toEqual([
      [{ kind: "extra_fee", extraFeeId: "settlement-extra", origin: "settlement" }, 6_000],
      [{ kind: "extra_fee", extraFeeId: "monthly-extra", origin: "monthly" }, 8_000],
    ]);
  });

  it("preserves all existing extra fees when the collection is omitted", () => {
    const source = snapshot();
    const target = source.bills[0];
    if (!target) throw new Error("缺少目标账单");
    target.lines.push(
      {
        kind: "extra_fee",
        label: "结算补费",
        amountMinor: 5_000,
        periodStart: null,
        periodEnd: null,
        referenceStart: null,
        referenceEnd: null,
        coveredDays: null,
        referenceDays: null,
        baseRentAmountMinor: null,
        sortOrder: 2,
        note: "退租结算费用",
        feeSnapshot: { kind: "extra_fee", extraFeeId: "settlement-extra", origin: "settlement" },
      },
      {
        kind: "extra_fee",
        label: "月度清洁费",
        amountMinor: 7_000,
        periodStart: null,
        periodEnd: null,
        referenceStart: null,
        referenceEnd: null,
        coveredDays: null,
        referenceDays: null,
        baseRentAmountMinor: null,
        sortOrder: 3,
        note: "月度附加费用",
        feeSnapshot: { kind: "extra_fee", extraFeeId: "monthly-extra", origin: "monthly" },
      },
    );

    const plan = buildMeterCorrectionPlan(source, {
      billId: target.id,
      expectedVersion: "version-1",
      reason: "只修正读数",
      readings: [{ kind: "water", readingDate: "2026-09-30", reading: "101" }],
    });

    expect(
      plan.bills[0]?.lines
        .filter((item) => item.kind === "extra_fee")
        .map((item) => [item.feeSnapshot, item.amountMinor]),
    ).toEqual([
      [{ kind: "extra_fee", extraFeeId: "settlement-extra", origin: "settlement" }, 5_000],
      [{ kind: "extra_fee", extraFeeId: "monthly-extra", origin: "monthly" }, 7_000],
    ]);
  });

  it("allows a full replacement that includes an existing settlement fee and preserves its origin", () => {
    const source = snapshot();
    const target = source.bills[0];
    if (!target) throw new Error("缺少目标账单");
    target.lines.push(
      {
        kind: "extra_fee",
        label: "结算补费",
        amountMinor: 5_000,
        periodStart: null,
        periodEnd: null,
        referenceStart: null,
        referenceEnd: null,
        coveredDays: null,
        referenceDays: null,
        baseRentAmountMinor: null,
        sortOrder: 2,
        note: "退租结算费用",
        feeSnapshot: { kind: "extra_fee", extraFeeId: "settlement-extra", origin: "settlement" },
      },
      {
        kind: "extra_fee",
        label: "月度清洁费",
        amountMinor: 7_000,
        periodStart: null,
        periodEnd: null,
        referenceStart: null,
        referenceEnd: null,
        coveredDays: null,
        referenceDays: null,
        baseRentAmountMinor: null,
        sortOrder: 3,
        note: "月度附加费用",
        feeSnapshot: { kind: "extra_fee", extraFeeId: "monthly-extra", origin: "monthly" },
      },
    );
    target.amountMinor += 12_000;

    const plan = buildMeterCorrectionPlan(source, {
      billId: target.id,
      expectedVersion: "version-1",
      reason: "替换全部附加费用",
      extraFees: [
        { id: "settlement-extra", name: "新结算名目", amountMinor: 6_000, note: "保留来源" },
        { id: "new-monthly-extra", name: "新月度费用", amountMinor: 1_000, note: "新 ID 默认月度" },
      ],
    });

    expect(
      plan.bills[0]?.lines
        .filter((item) => item.kind === "extra_fee")
        .map((item) => [item.feeSnapshot, item.amountMinor]),
    ).toEqual([
      [{ kind: "extra_fee", extraFeeId: "settlement-extra", origin: "settlement" }, 6_000],
      [{ kind: "extra_fee", extraFeeId: "new-monthly-extra", origin: "monthly" }, 1_000],
    ]);
  });

  it("removes previously saved extra fees that are omitted from a replacement set", () => {
    const source = snapshot();
    const target = source.bills[0];
    if (!target) throw new Error("缺少目标账单");
    target.lines.push({
      kind: "extra_fee",
      label: "结算补费",
      amountMinor: 5_000,
      periodStart: null,
      periodEnd: null,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 2,
      note: "退租结算费用",
      feeSnapshot: { kind: "extra_fee", extraFeeId: "settlement-extra", origin: "settlement" },
    });
    target.amountMinor += 5_000;

    const plan = buildMeterCorrectionPlan(source, {
      billId: target.id,
      expectedVersion: "version-1",
      reason: "仅保留显式传入费用",
      extraFees: [{ id: "replacement", name: "新费用", amountMinor: 100, note: "" }],
    });

    expect(plan.bills[0]?.lines.filter((item) => item.kind === "extra_fee")).toMatchObject([
      { feeSnapshot: { extraFeeId: "replacement", origin: "monthly" }, amountMinor: 100 },
    ]);
  });

  it("treats an empty extra-fee collection as deletion of all saved origins", () => {
    const source = snapshot();
    const target = source.bills[0];
    if (!target) throw new Error("缺少目标账单");
    target.lines.push({
      kind: "extra_fee",
      label: "结算补费",
      amountMinor: 5_000,
      periodStart: null,
      periodEnd: null,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 2,
      note: "退租结算费用",
      feeSnapshot: { kind: "extra_fee", extraFeeId: "settlement-extra", origin: "settlement" },
    });
    target.amountMinor += 5_000;

    const plan = buildMeterCorrectionPlan(source, {
      billId: target.id,
      expectedVersion: "version-1",
      reason: "删除全部附加费用",
      extraFees: [],
    });

    expect(plan.bills[0]?.lines.filter((item) => item.kind === "extra_fee")).toEqual([]);
  });
});
