import type { RentalBillDetail, RentalBillLine, RentalMeterReadingInput } from "@xpense/shared";
import { describe, expect, it } from "vitest";
import { rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import type { SettlementPlan } from "./rental-finance.types.js";
import {
  proposeSettlementReadings,
  settlementReadingEndsToRewire,
} from "./rental-settlement-readings.rules.js";

const contractId = "00000000-0000-4000-8000-000000000001";
const billId = "00000000-0000-4000-8000-000000000201";
const requests: RentalMeterReadingInput[] = [
  { kind: "water", readingDate: "2026-09-30", reading: "105" },
  { kind: "electricity", readingDate: "2026-09-30", reading: "55" },
];

describe("结算末次读数准备", () => {
  it("为已计费的 P→E 区间构造不持久化的 P→T 候选", () => {
    const source = meteredSource();
    const existingCount = source.readings.length;
    let id = 0;

    const candidates = proposeSettlementReadings(
      source,
      { contractId, extraFees: [], finalReadings: requests },
      () => `candidate-${++id}`,
    );

    expect(
      candidates.map(({ reading, write }) => ({
        id: reading.id,
        kind: reading.kind,
        readingDate: reading.readingDate,
        predecessorId: write.predecessorId,
      })),
    ).toEqual([
      {
        id: "candidate-1",
        kind: "water",
        readingDate: "2026-09-30",
        predecessorId: source.readings.find(
          ({ kind, predecessorId }) => kind === "water" && predecessorId === null,
        )?.id,
      },
      {
        id: "candidate-2",
        kind: "electricity",
        readingDate: "2026-09-30",
        predecessorId: source.readings.find(
          ({ kind, predecessorId }) => kind === "electricity" && predecessorId === null,
        )?.id,
      },
    ]);
    expect(source.readings).toHaveLength(existingCount);
  });

  it("拒绝插入到后继读数之前但数值高于后继的终值", () => {
    const source = meteredSource();

    expect(() =>
      proposeSettlementReadings(source, {
        contractId,
        extraFees: [],
        finalReadings: [{ kind: "water", readingDate: "2026-09-30", reading: "120" }],
      }),
    ).toThrow("末次读数不能高于后续水电读数");
  });

  it("P→T 搬到结束月新账单后仍给原 E 安排新的 T 前驱", () => {
    const source = meteredSource();
    const candidates = proposeSettlementReadings(
      source,
      { contractId, extraFees: [], finalReadings: requests },
      (index) => `candidate-${index}`,
    );
    const byKind = new Map(candidates.map(({ reading }) => [reading.kind, reading]));
    const bill = source.bills[0];
    if (!bill) throw new Error("Expected the historical billed interval");
    const lines = bill.lines.map((line) => {
      const saved = line.feeSnapshot;
      if (saved?.kind !== "water" && saved?.kind !== "electricity") return line;
      const terminal = byKind.get(saved.kind);
      if (!terminal) throw new Error("Expected the requested terminal reading");
      return {
        ...line,
        periodEnd: terminal.readingDate,
        feeSnapshot: {
          ...saved,
          endReadingId: terminal.id,
          endDate: terminal.readingDate,
          endReading: terminal.reading,
        },
      };
    });
    const plan: SettlementPlan = {
      effectiveEndDate: "2026-09-30",
      withdrawnBillIds: [bill.id],
      finalBills: [{ billId: "ending-month-bill", billingMonth: "2026-09", lines, amountMinor: 0 }],
      finalCostMinor: 0,
      differenceMinor: 0,
    };
    const sourceWithCandidates = {
      ...source,
      readings: [...source.readings, ...candidates.map(({ reading }) => reading)],
    };

    const updates = settlementReadingEndsToRewire(
      sourceWithCandidates,
      {
        contractId,
        extraFees: [],
        finalReadings: requests,
        expectedVersion: "version",
        idempotencyKey: "key",
      },
      plan,
    );

    expect(
      updates.map(({ current, predecessorId }) => ({
        id: current.id,
        predecessorId,
        reading: current.reading,
        readingDate: current.readingDate,
      })),
    ).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000211",
        predecessorId: "candidate-1",
        reading: "110",
        readingDate: "2026-10-31",
      },
      {
        id: "00000000-0000-4000-8000-000000000212",
        predecessorId: "candidate-2",
        reading: "60",
        readingDate: "2026-10-31",
      },
    ]);
  });

  it("复用同日同值的真实末读，拒绝同日不同值覆盖", () => {
    const source = meteredSource();
    const waterRequest = requests[0];
    if (!waterRequest) throw new Error("Expected the water final reading request");
    const water = source.readings.find(
      ({ kind, predecessorId }) => kind === "water" && predecessorId === null,
    );
    if (!water) throw new Error("Expected the water baseline");
    source.readings.push({
      ...water,
      id: "00000000-0000-4000-8000-000000000213",
      readingDate: "2026-09-30",
      reading: "105",
    });

    expect(
      proposeSettlementReadings(source, {
        contractId,
        extraFees: [],
        finalReadings: [waterRequest],
      }),
    ).toEqual([]);
    expect(() =>
      proposeSettlementReadings(source, {
        contractId,
        extraFees: [],
        finalReadings: [{ ...waterRequest, reading: "106" }],
      }),
    ).toThrow("末次读数与同日已保存读数冲突");
  });
});

function meteredSource() {
  const source = rentalFinanceSnapshot({
    context: {
      ...rentalFinanceSnapshot().context,
      today: "2026-10-31",
    },
    contract: {
      ...rentalFinanceSnapshot().contract,
      lifecycleStatus: "terminated",
      terminationDate: "2026-09-30",
    },
  });
  const lines: RentalBillLine[] = [];
  for (const [index, kind] of (["water", "electricity"] as const).entries()) {
    const start = source.readings.find(
      ({ kind: current, predecessorId }) => current === kind && predecessorId === null,
    );
    if (!start) throw new Error(`Expected the ${kind} baseline`);
    const end = {
      ...start,
      id: `00000000-0000-4000-8000-${String(211 + index).padStart(12, "0")}`,
      readingDate: "2026-10-31",
      reading: kind === "water" ? "110" : "60",
      predecessorId: start.id,
    };
    source.readings.push(end);
    lines.push({
      kind,
      label: kind === "water" ? "水费" : "电费",
      amountMinor: 3000,
      periodStart: start.readingDate,
      periodEnd: end.readingDate,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: index,
      feeSnapshot: {
        kind,
        startReadingId: start.id,
        endReadingId: end.id,
        startDate: start.readingDate,
        endDate: end.readingDate,
        startReading: start.reading,
        endReading: end.reading,
        unitPrice: kind === "water" ? "3.0000" : "4.0000",
        overrideReason: null,
      },
    });
  }
  const bill: RentalBillDetail = {
    id: billId,
    billNumber: "RB-2026-000201",
    contractId,
    contractNumber: source.contract.contractNumber,
    propertyId: source.contract.propertyId,
    propertyName: source.contract.propertyName,
    currencyCode: source.context.currencyCode,
    type: "monthly",
    status: "active",
    sourceKey: "monthly:2026-10",
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    effectiveEnd: "2026-10-31",
    dueDate: "2026-10-31",
    amountMinor: lines.reduce((sum, line) => sum + line.amountMinor, 0),
    dueState: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    modelVersion: 2,
    billingMonth: "2026-10",
    revision: 1,
    lines,
    generationId: null,
    adjustmentId: null,
    adjustment: null,
    snapshot: {
      propertyId: source.contract.propertyId,
      propertyName: source.contract.propertyName,
      contractNumber: source.contract.contractNumber,
      spaces: source.contract.spaces,
      parties: source.contract.parties.map(({ tenantId, name, isPrimaryPayer }) => ({
        tenantId,
        name,
        isPrimaryPayer,
      })),
    },
    voidReason: null,
    voidedAt: null,
    voidedBy: null,
    history: [],
  };
  source.bills = [bill];
  return source;
}
