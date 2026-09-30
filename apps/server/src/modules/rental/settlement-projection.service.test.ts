import { describe, expect, it, vi } from "vitest";

import { financeContractId, rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { rentalCashSourceVersion } from "./rental-cash.version.rules.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import { SettlementProjectionService } from "./settlement-projection.service.js";

const settlementId = "00000000-0000-4000-8000-000000000040";
const eventId = "00000000-0000-4000-8000-000000000041";
const linkedBillId = "00000000-0000-4000-8000-000000000042";
const depositBillId = "00000000-0000-4000-8000-000000000043";
const voidBillId = "00000000-0000-4000-8000-000000000044";
const settlementTarget = { kind: "settlement", settlementId } as const;
const scope = { organizationId: "org", contractId: financeContractId };
const actor = "user";
const tx = {};

function settlementRecord() {
  return {
    id: settlementId,
    ...scope,
    eventId,
    kind: "termination",
    effectiveEndDate: "2026-08-31",
    version: "saved-settlement-version",
    revision: 1,
    finalCostMinor: 1,
    status: "settled",
    snapshot: {
      effectiveEndDate: "2026-08-31",
      finalBills: [],
      finalCostMinor: 1,
      differenceMinor: 0,
    },
    confirmedAt: new Date("2026-09-01T00:00:00.000Z"),
    confirmedByUserId: actor,
  };
}

function projectionFacts(
  snapshot: RentalFinanceSnapshot,
  linkedBillIds: string[],
  revision = 1,
  finalCostMinor = 1,
  status = "settled",
) {
  return {
    organizationId: scope.organizationId,
    contractId: scope.contractId,
    contract: {
      billingMode: "monthly_settlement",
      lifecycleStatus: "terminated",
      terminationDate: "2026-08-31",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    },
    bills: snapshot.bills.map((bill) => ({
      id: bill.id,
      type: bill.type,
      status: bill.status,
      modelVersion: bill.modelVersion,
      revision: bill.revision,
      amountMinor: bill.amountMinor,
      sourceKey: bill.sourceKey,
    })),
    cashEntries: snapshot.cashEntries,
    settlement: {
      id: settlementId,
      eventId,
      kind: "termination",
      effectiveEndDate: "2026-08-31",
      revision,
      finalCostMinor,
      status,
    },
    settlementBillIds: linkedBillIds,
    readings: snapshot.readings.map(
      ({ id, kind, readingDate, reading, revision: readingRevision, predecessorId }) => ({
        id,
        kind,
        readingDate,
        reading,
        revision: readingRevision,
        predecessorId,
      }),
    ),
  };
}

function financeSnapshot() {
  const base = rentalFinanceSnapshot();
  return {
    ...base,
    contract: {
      ...base.contract,
      lifecycleStatus: "terminated",
      terminationDate: "2026-08-31",
    } as never,
    bills: [
      {
        id: linkedBillId,
        contractId: financeContractId,
        type: "monthly",
        status: "active",
        modelVersion: 2,
        revision: 2,
        billingMonth: "2026-08",
        sourceKey: "monthly:2026-08",
        amountMinor: 200_000,
        lines: [{ id: "rent-line", kind: "rent_period", amountMinor: 200_000 }],
      },
      {
        id: depositBillId,
        contractId: financeContractId,
        type: "deposit",
        status: "active",
        modelVersion: 2,
        revision: 1,
        amountMinor: 300_000,
        lines: [{ id: "deposit-line", kind: "deposit", amountMinor: 300_000 }],
      },
      {
        id: voidBillId,
        contractId: financeContractId,
        type: "monthly",
        status: "voided",
        modelVersion: 2,
        revision: 1,
        amountMinor: 900_000,
        lines: [{ id: "void-line", kind: "rent_period", amountMinor: 900_000 }],
      },
    ] as never,
    cashEntries: [
      {
        id: "deposit-receipt",
        contractId: financeContractId,
        target: { kind: "bill", billId: depositBillId },
        kind: "receipt",
        purpose: "deposit_receipt",
        amountMinor: 300_000,
        occurredOn: "2026-08-15",
        note: null,
        createdAt: "2026-08-15T00:00:00.000Z",
        createdByUserId: actor,
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      },
      {
        id: "void-bill-receipt",
        contractId: financeContractId,
        target: { kind: "bill", billId: voidBillId },
        kind: "receipt",
        purpose: "bill_receipt",
        amountMinor: 100_000,
        occurredOn: "2026-08-20",
        note: null,
        createdAt: "2026-08-20T00:00:00.000Z",
        createdByUserId: actor,
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      },
    ],
  } as RentalFinanceSnapshot;
}

function harness(
  snapshot = financeSnapshot(),
  current: ReturnType<typeof settlementRecord> | null = settlementRecord(),
  links = [linkedBillId, depositBillId],
) {
  let currentRecord = current ?? settlementRecord();
  const settlements = {
    findCurrent: vi.fn(async () => current),
    billIds: vi.fn(async () => links),
    revise: vi.fn(async (_scope, _id, update) => {
      currentRecord = {
        ...currentRecord,
        effectiveEndDate: update.plan.effectiveEndDate,
        version: update.version,
        revision: currentRecord.revision + 1,
        finalCostMinor: update.plan.finalCostMinor,
        status: update.status,
        snapshot: update.plan,
      };
      return currentRecord;
    }),
  };
  const sources = { read: vi.fn(async () => structuredClone(snapshot)) };
  const projectionSources = {
    readMany: vi.fn(async () => [
      projectionFacts(
        snapshot,
        links,
        currentRecord.revision,
        currentRecord.finalCostMinor,
        currentRecord.status,
      ),
    ]),
  };
  const service = new SettlementProjectionService(
    sources as never,
    projectionSources as never,
    settlements as never,
  );
  return { service, settlements, sources, projectionSources, snapshot };
}

describe("SettlementProjectionService", () => {
  it("returns null and performs no writes when no settlement is confirmed", async () => {
    const h = harness(financeSnapshot(), null);
    h.settlements.findCurrent.mockResolvedValueOnce(null as never);

    await expect(h.service.refresh(scope, actor, tx as never)).resolves.toBeNull();
    expect(h.settlements.revise).not.toHaveBeenCalled();
  });

  it("refreshes from actual linked current bills and all contract cash while preserving the saved event date", async () => {
    const h = harness();

    const result = await h.service.refresh(scope, actor, tx as never);

    expect(result).toMatchObject({
      id: settlementId,
      eventId,
      effectiveEndDate: "2026-08-31",
      revision: 2,
      finalCostMinor: 200_000,
      status: "pending_refund",
      balance: {
        receivedMinor: 400_000,
        refundedMinor: 0,
        refundableMinor: 200_000,
      },
    });
    expect(h.settlements.revise).toHaveBeenCalledWith(
      scope,
      settlementId,
      expect.objectContaining({
        status: "pending_refund",
        plan: expect.objectContaining({
          effectiveEndDate: "2026-08-31",
          finalCostMinor: 200_000,
          finalBills: [expect.objectContaining({ billId: linkedBillId, amountMinor: 200_000 })],
        }),
      }),
      { userId: actor },
      tx,
    );
    expect(h.projectionSources.readMany).toHaveBeenCalledTimes(2);
  });

  it("uses the post-revision source token so the returned settlement version matches the next read", async () => {
    const h = harness();

    const result = await h.service.refresh(scope, actor, tx as never);
    const nextFacts = projectionFacts(
      h.snapshot,
      [linkedBillId, depositBillId],
      2,
      200_000,
      "pending_refund",
    );
    const expectedVersion = rentalCashSourceVersion(nextFacts as never, settlementTarget);

    expect(result?.version).toBe(expectedVersion);
    expect(h.settlements.revise.mock.calls[0]?.[2].version).toBe(expectedVersion);
  });

  it("keeps the linked bill's saved discount when current default rent changes and creates no missing month", async () => {
    const snapshot = financeSnapshot();
    snapshot.contract = { ...snapshot.contract, rentAmountMinor: 9_000_000 };
    const monthly = snapshot.bills[0] as never as {
      amountMinor: number;
      lines: Array<{ id: string; kind: string; amountMinor: number }>;
    };
    monthly.amountMinor = 200_000;
    monthly.lines = [
      { id: "rent-line", kind: "rent_period", amountMinor: 300_000 },
      { id: "discount-line", kind: "extra_fee", amountMinor: -100_000 },
    ];
    const h = harness(snapshot);

    const result = await h.service.refresh(scope, actor, tx as never);

    expect(result?.finalCostMinor).toBe(200_000);
    expect(h.settlements.revise.mock.calls[0]?.[2].plan.finalBills).toHaveLength(1);
    expect(h.settlements.revise.mock.calls[0]?.[2].plan.finalBills[0]).toMatchObject({
      billId: linkedBillId,
      billingMonth: "2026-08",
      amountMinor: 200_000,
    });
  });

  it("accumulates safe signed bill lines before checking the final sum", async () => {
    for (const amounts of [
      [200_000, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER],
      [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 200_000],
    ]) {
      const snapshot = financeSnapshot();
      const monthly = snapshot.bills[0] as never as {
        lines: Array<{ id: string; kind: string; amountMinor: number }>;
      };
      monthly.lines = amounts.map((amountMinor, index) => ({
        id: `signed-line-${index}`,
        kind: "extra_fee",
        amountMinor,
      }));
      const h = harness(snapshot);

      await expect(h.service.refresh(scope, actor, tx as never)).resolves.toMatchObject({
        finalCostMinor: 200_000,
      });
      expect(h.settlements.revise.mock.calls.at(-1)?.[2].plan.finalBills[0]?.amountMinor).toBe(
        200_000,
      );
    }
  });

  it("rejects a final linked bill sum outside the safe integer range", async () => {
    const snapshot = financeSnapshot();
    const monthly = snapshot.bills[0] as never as {
      lines: Array<{ id: string; kind: string; amountMinor: number }>;
    };
    monthly.lines = [Number.MAX_SAFE_INTEGER, 1].map((amountMinor, index) => ({
      id: `overflow-line-${index}`,
      kind: "extra_fee",
      amountMinor,
    }));
    const h = harness(snapshot);

    await expect(h.service.refresh(scope, actor, tx as never)).rejects.toThrow(
      "已关联结算账单金额超出安全整数范围",
    );
    expect(h.settlements.revise).not.toHaveBeenCalled();
  });

  it("excludes a newly voided linked bill's old cost but still counts its effective cash once", async () => {
    const snapshot = financeSnapshot();
    const monthly = snapshot.bills[0] as never as { status: string };
    monthly.status = "voided";
    const h = harness(snapshot);

    const result = await h.service.refresh(scope, actor, tx as never);

    expect(result).toMatchObject({
      finalCostMinor: 0,
      status: "pending_refund",
      balance: { receivedMinor: 400_000, refundableMinor: 400_000 },
    });
    expect(h.settlements.revise.mock.calls[0]?.[2].plan.finalBills).toEqual([]);
  });
});
