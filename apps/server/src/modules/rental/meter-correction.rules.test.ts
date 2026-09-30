import type { RentalBillDetail, RentalBillLine, RentalCashEntry } from "@xpense/shared";
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
});
