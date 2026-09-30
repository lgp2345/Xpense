import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type {
  RentalBillDetail,
  RentalBillLine,
  RentalBillRevisionInput,
  RentalSettlementDetail,
} from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import {
  financeContractId,
  rentalFinanceAuth,
  rentalFinanceSnapshot,
} from "../../test/rental-finance-fixtures.js";
import { BillRevisionsService } from "./bill-revisions.service.js";
import { BillsReadService } from "./bills-read.service.js";
import { buildMeterCorrectionPlan } from "./meter-correction.rules.js";
import { calculateRentalCashBalance } from "./rental-cash.rules.js";
import type { RentalCashProjectionFacts } from "./rental-cash-projection.repository.types.js";
import type { RentalFinanceSnapshot, RentalMeterReading } from "./rental-finance.types.js";
import { financeSourceVersion } from "./rental-finance-request.rules.js";

const revisionAuth = {
  ...rentalFinanceAuth,
  permissions: [
    ...rentalFinanceAuth.permissions,
    "rental_monthly_bills:adjust",
    "rental_settlements:confirm",
  ],
};
const targetBillId = "bill-september";
const adjacentBillId = "bill-october";
const settlementId = "settlement-current";
const idempotencyKey = "00000000-0000-4000-8000-000000000099";

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
    contractId: financeContractId,
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
    contractId: financeContractId,
    type: "monthly",
    status: "active",
    modelVersion: 2,
    billingMonth,
    revision: 1,
    amountMinor: 200_000 + utilityAmount,
    dueDate: `${billingMonth}-30`,
    lines,
  } as RentalBillDetail;
}

function sourceSnapshot(): RentalFinanceSnapshot {
  const previous = reading("reading-previous", "2026-08-31", "90", null);
  const boundary = reading("reading-boundary", "2026-09-30", "100", previous.id);
  const next = reading("reading-next", "2026-10-31", "120", boundary.id);
  const receipt = {
    id: "cash-bill-receipt",
    contractId: financeContractId,
    target: { kind: "bill", billId: targetBillId },
    kind: "receipt",
    purpose: "bill_receipt",
    amountMinor: 203_000,
    occurredOn: "2026-09-30",
    note: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    createdByUserId: "user",
    revokedAt: null,
    revokedByUserId: null,
    revokeReason: null,
  } as const;
  const settlementReceipt = {
    ...receipt,
    id: "cash-settlement-receipt",
    target: { kind: "settlement", settlementId },
    purpose: "settlement_receipt",
    amountMinor: 10_000,
  } as const;
  const settlement: RentalSettlementDetail = {
    id: settlementId,
    contractId: financeContractId,
    eventId: "event-1",
    kind: "termination",
    effectiveEndDate: "2026-10-31",
    version: "settlement-version-1",
    revision: 1,
    finalCostMinor: 208_000,
    balance: {
      receivedMinor: 213_000,
      refundedMinor: 0,
      netReceivedMinor: 213_000,
      outstandingMinor: 0,
      refundableMinor: 5_000,
      state: "refundable",
      overdue: false,
      version: "settlement-version-1",
    },
    status: "pending_refund",
    confirmedAt: "2026-10-31T00:00:00.000Z",
    confirmedByUserId: "user",
  };
  return rentalFinanceSnapshot({
    readings: [previous, boundary, next],
    bills: [
      bill(targetBillId, "2026-09", previous, boundary, "3", 3_000),
      bill(adjacentBillId, "2026-10", boundary, next, "4", 8_000),
    ],
    cashEntries: [receipt, settlementReceipt],
    settlement,
  });
}

function negativeNetCashSnapshot(): RentalFinanceSnapshot {
  // Reachable sequence: record a 100 receipt on a zero bill, refund it, then revoke the receipt.
  const source = sourceSnapshot();
  const target = source.bills.find(({ id }) => id === targetBillId);
  const priorReceipt = source.cashEntries.find(
    (entry) => entry.target.kind === "bill" && entry.target.billId === targetBillId,
  );
  if (!target || !priorReceipt) throw new Error("Valid zero-bill cash fixture unavailable");
  target.amountMinor = 0;
  target.lines = [
    {
      kind: "rent_period",
      label: "月度租金",
      amountMinor: 0,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      referenceStart: "2026-09-01",
      referenceEnd: "2026-09-30",
      coveredDays: 30,
      referenceDays: 30,
      baseRentAmountMinor: 0,
      sortOrder: 0,
    },
  ];
  target.history = [];
  source.bills = [target];
  source.cashEntries = [
    {
      ...priorReceipt,
      id: "cash-revoked-receipt",
      amountMinor: 100,
      revokedAt: "2026-09-30T00:00:00.000Z",
      revokedByUserId: "user",
      revokeReason: "撤销错误收款",
    },
    {
      ...priorReceipt,
      id: "cash-effective-refund",
      kind: "refund",
      purpose: "refund",
      amountMinor: 100,
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    },
  ];
  source.settlement = null;
  return source;
}

function harness(initial: RentalFinanceSnapshot = sourceSnapshot()) {
  const tx = {};
  let savedRequests = new Map<string, Record<string, unknown>>();
  let working = Object.assign(structuredClone(initial), {
    billRevisions: [] as Array<Record<string, unknown>>,
    readingRevisions: [] as Array<Record<string, unknown>>,
    requests: [] as Array<Record<string, unknown>>,
    linkedBillIds: [adjacentBillId],
    auditEntries: [] as Array<Record<string, unknown>>,
  });
  const source = {
    read: vi.fn(async () => structuredClone(working) as RentalFinanceSnapshot),
  };
  const bills = {
    detail: vi.fn(
      async (_organizationId: string, id: string) =>
        working.bills.find((item) => item.id === id) ?? null,
    ),
    findGeneration: vi.fn().mockResolvedValue(null),
  };
  const revisions = {
    append: vi.fn(async (scope, billId, lines, amountMinor, reason, actor) => {
      const previous = working.bills.find((item) => item.id === billId);
      if (!previous) throw new Error("missing test bill");
      const revision = {
        id: `revision-${working.billRevisions.length + 1}`,
        ...scope,
        billId,
        revision: previous.revision ?? 1,
        amountMinor: previous.amountMinor,
        billSnapshot: structuredClone(previous),
        linesSnapshot: structuredClone(previous.lines),
        reason,
        createdByUserId: actor.userId,
      };
      working.billRevisions.push(revision);
      const updated = {
        ...previous,
        amountMinor,
        lines: structuredClone(lines),
        revision: (previous.revision ?? 1) + 1,
      };
      working.bills = working.bills.map((item) => (item.id === billId ? updated : item));
      return { bill: updated, revision };
    }),
    history: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
  };
  const readings = {
    reviseBoundary: vi.fn(async (scope, id, input, reason, actor) => {
      const previous = working.readings.find((item) => item.id === id);
      if (!previous) throw new Error("missing test reading");
      working.readingRevisions.push({
        ...scope,
        readingId: id,
        revision: previous.revision,
        readingSnapshot: structuredClone(previous),
        reason,
        createdByUserId: actor.userId,
      });
      const updated = {
        ...previous,
        ...input,
        revision: previous.revision + 1,
        reason,
        updatedByUserId: actor.userId,
      };
      working.readings = working.readings.map((item) => (item.id === id ? updated : item));
      return updated;
    }),
  };
  const settlements = {
    findCurrent: vi.fn(async () =>
      working.settlement ? ({ id: working.settlement.id } as never) : null,
    ),
    billIds: vi.fn(async () => [...working.linkedBillIds]),
  };
  const financeRequests = {
    find: vi.fn(async (_scope, key: string) => savedRequests.get(key) ?? null),
    complete: vi.fn(async (scope, input, actor) => {
      const saved = { ...scope, ...input, actor };
      savedRequests.set(input.idempotencyKey, saved);
      working.requests.push(structuredClone(saved));
      return saved;
    }),
  };
  const contracts = {
    find: vi.fn(async () => ({ id: financeContractId, propertyId: "property-1" })),
    findForUpdate: vi.fn(async () => ({ id: financeContractId, propertyId: "property-1" })),
  };
  const policy = {
    lockOrganizationContext: vi.fn(async () => ({ today: initial.context.today })),
    requireContract: vi.fn((value) => value),
    requireOwnedPropertyForUpdate: vi.fn(async () => ({ id: "property-1" })),
  };
  const projection = {
    refresh: vi.fn(async () => {
      if (!working.settlement) return null;
      const linked = new Set(working.linkedBillIds);
      const finalCostMinor = working.bills
        .filter((item) => linked.has(item.id))
        .reduce((total, item) => total + item.amountMinor, 0);
      working.settlement = {
        ...working.settlement,
        finalCostMinor,
        revision: working.settlement.revision + 1,
      };
      return structuredClone(working.settlement);
    }),
  };
  const access = {
    assertPermission: vi.fn((auth, permission: string) => {
      if (!auth.permissions.includes(permission)) throw new ForbiddenException();
    }),
  };
  const audit = {
    appendRequired: vi.fn(async (entry) => {
      working.auditEntries.push(structuredClone(entry));
    }),
  };
  const service = new BillRevisionsService(
    source as never,
    bills as never,
    revisions as never,
    readings as never,
    settlements as never,
    financeRequests as never,
    contracts as never,
    policy as never,
    projection as never,
    access as never,
    audit as never,
    {
      run: vi.fn(async (operation) => {
        const before = structuredClone(working);
        const requestBefore = structuredClone(savedRequests);
        try {
          return await operation(tx);
        } catch (error) {
          working = before;
          savedRequests = requestBefore;
          throw error;
        }
      }),
    } as never,
  );
  const previewInput = {
    billId: targetBillId,
    expectedVersion: "untrusted-preview-seed",
    readings: [{ kind: "water", readingDate: "2026-09-30", reading: "110" }],
    reason: "更正公共水表读数",
  };
  return {
    service,
    initial,
    source,
    bills,
    revisions,
    readings,
    settlements,
    financeRequests,
    contracts,
    policy,
    projection,
    access,
    audit,
    previewInput,
    tx,
    savedRequest: (key = idempotencyKey) => savedRequests.get(key) ?? null,
    state: () => structuredClone(working),
  };
}

function cashProjectionFacts(source: RentalFinanceSnapshot): RentalCashProjectionFacts {
  return {
    organizationId: source.context.organizationId,
    contractId: source.contract.id,
    contract: {
      billingMode: source.contract.billingMode ?? "monthly",
      lifecycleStatus: source.contract.lifecycleStatus,
      startDate: source.contract.startDate,
      endDate: source.contract.endDate,
      rentAmountMinor: source.contract.rentAmountMinor,
      billingAnchor: source.contract.billingAnchor,
      paymentIntervalMonths: source.contract.paymentIntervalMonths,
      dueDaysBefore: source.contract.dueDaysBefore,
      terminationDate: source.contract.terminationDate,
      cancelledAt: null,
    },
    bills: source.bills.map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      modelVersion: item.modelVersion ?? 2,
      billingMonth: item.billingMonth ?? null,
      revision: item.revision ?? 1,
      amountMinor: item.amountMinor,
      sourceKey: `monthly:${item.billingMonth ?? "unknown"}`,
      dueDate: item.dueDate,
    })),
    cashEntries: source.cashEntries.map((entry) => ({
      ...entry,
      billId: entry.target.kind === "bill" ? entry.target.billId : null,
      settlementId: entry.target.kind === "settlement" ? entry.target.settlementId : null,
      revokedAt: entry.revokedAt ? new Date(entry.revokedAt) : null,
    })),
    settlement: source.settlement
      ? {
          id: source.settlement.id,
          eventId: source.settlement.eventId,
          kind: source.settlement.kind,
          effectiveEndDate: source.settlement.effectiveEndDate,
          revision: source.settlement.revision,
          finalCostMinor: source.settlement.finalCostMinor,
          status: source.settlement.status,
        }
      : null,
    settlementBillIds: [],
    readings: source.readings.map((item) => ({
      id: item.id,
      kind: item.kind,
      readingDate: item.readingDate,
      reading: item.reading,
      revision: item.revision,
      predecessorId: item.predecessorId,
    })),
  };
}

describe("BillRevisionsService", () => {
  it("previews adjacent meter corrections using each bill's saved unit price and linked settlement cash", async () => {
    const h = harness();
    const preview = await h.service.preview(revisionAuth as never, h.previewInput as never);

    expect(preview.affectedBills).toEqual([
      { billId: targetBillId, beforeAmountMinor: 203_000, afterAmountMinor: 206_000 },
      { billId: adjacentBillId, beforeAmountMinor: 208_000, afterAmountMinor: 204_000 },
    ]);
    expect(preview.settlementDifferenceMinor).toBe(-9_000);
    expect(preview.version).not.toBe("untrusted-preview-seed");
  });

  it("rejects a plan when the adjacent settlement-linked bill lacks settlement permission", async () => {
    const h = harness();
    const auth = {
      ...revisionAuth,
      permissions: revisionAuth.permissions.filter((item) => item !== "rental_settlements:confirm"),
    };

    await expect(
      h.service.adjust(
        auth as never,
        {
          ...h.previewInput,
          expectedVersion: "any",
          idempotencyKey,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.readings.reviseBoundary).not.toHaveBeenCalled();
    expect(h.revisions.append).not.toHaveBeenCalled();
  });

  it("keeps single-period price and extra-fee changes scoped to the target bill", async () => {
    const h = harness();
    const preview = await h.service.preview(
      revisionAuth as never,
      {
        billId: targetBillId,
        expectedVersion: "seed",
        overrides: { waterUnitPrice: "3.5", reason: "仅调整本期价格" },
        extraFees: [{ id: "monthly-extra", name: "清洁费", amountMinor: 500, note: "本月" }],
        reason: "仅更正本期费用",
      } as never,
    );

    expect(preview.affectedBills.map(({ billId }) => billId)).toEqual([targetBillId]);
    expect(h.readings.reviseBoundary).not.toHaveBeenCalled();
  });

  it("rejects non-monotonic source readings before any repository write", async () => {
    const h = harness();

    await expect(
      h.service.adjust(
        revisionAuth as never,
        {
          ...h.previewInput,
          readings: [{ kind: "water", readingDate: "2026-09-30", reading: "121" }],
          expectedVersion: "any",
          idempotencyKey,
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.readings.reviseBoundary).not.toHaveBeenCalled();
    expect(h.revisions.append).not.toHaveBeenCalled();
  });

  it("returns 404 for a bill id that is outside the caller's organization", async () => {
    const h = harness();
    h.bills.detail.mockResolvedValue(null);

    await expect(
      h.service.preview(
        revisionAuth as never,
        {
          ...h.previewInput,
          billId: "foreign-organization-bill",
        } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.source.read).not.toHaveBeenCalled();
  });

  it("rejects stale source versions without changing readings, bill revisions, audit, or request state", async () => {
    const h = harness();
    const preview = await h.service.preview(revisionAuth as never, h.previewInput as never);
    h.source.read.mockResolvedValueOnce({
      ...structuredClone(h.initial),
      readings: h.initial.readings.map((item) => ({ ...item, revision: item.revision + 1 })),
    });

    await expect(
      h.service.adjust(
        revisionAuth as never,
        {
          ...h.previewInput,
          expectedVersion: preview.version,
          idempotencyKey,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.readings.reviseBoundary).not.toHaveBeenCalled();
    expect(h.revisions.append).not.toHaveBeenCalled();
    expect(h.financeRequests.complete).not.toHaveBeenCalled();
    expect(h.audit.appendRequired).not.toHaveBeenCalled();
  });

  it("includes the current settlement bill membership in the adjustment version", async () => {
    const h = harness();
    const preview = await h.service.preview(revisionAuth as never, h.previewInput as never);
    h.settlements.billIds.mockResolvedValueOnce([targetBillId]);

    await expect(
      h.service.adjust(
        revisionAuth as never,
        {
          ...h.previewInput,
          expectedVersion: preview.version,
          idempotencyKey,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.readings.reviseBoundary).not.toHaveBeenCalled();
    expect(h.revisions.append).not.toHaveBeenCalled();
  });

  it("replays a completed revision before checking its now-stale source version", async () => {
    const h = harness();
    const preview = await h.service.preview(revisionAuth as never, h.previewInput as never);
    const input = {
      ...h.previewInput,
      expectedVersion: preview.version,
      idempotencyKey,
    };
    const first = await h.service.adjust(revisionAuth as never, input as never);
    const readsAfterFirstWrite = h.source.read.mock.calls.length;
    const second = await h.service.adjust(revisionAuth as never, input as never);

    expect(second).toEqual(first);
    expect(h.source.read).toHaveBeenCalledTimes(readsAfterFirstWrite);
    expect(h.revisions.append).toHaveBeenCalledTimes(2);
    expect(h.financeRequests.complete).toHaveBeenCalledTimes(1);
  });

  it("rechecks current settlement permission before replaying the saved response", async () => {
    const h = harness();
    const preview = await h.service.preview(revisionAuth as never, h.previewInput as never);
    const input = {
      ...h.previewInput,
      expectedVersion: preview.version,
      idempotencyKey,
    };
    const original = await h.service.adjust(revisionAuth as never, input as never);
    const beforeReplay = h.state();
    const sourceReads = h.source.read.mock.calls.length;
    const appendCalls = h.revisions.append.mock.calls.length;
    const readingCalls = h.readings.reviseBoundary.mock.calls.length;
    const projectionCalls = h.projection.refresh.mock.calls.length;
    const auditCalls = h.audit.appendRequired.mock.calls.length;
    const requestCalls = h.financeRequests.complete.mock.calls.length;
    const currentLookupCalls = h.settlements.findCurrent.mock.calls.length;
    const membershipCalls = h.settlements.billIds.mock.calls.length;
    const authWithoutSettlementPermission = {
      ...revisionAuth,
      permissions: revisionAuth.permissions.filter(
        (permission) => permission !== "rental_settlements:confirm",
      ),
    };

    await expect(
      h.service.adjust(authWithoutSettlementPermission as never, input as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(h.settlements.findCurrent).toHaveBeenCalledTimes(currentLookupCalls + 1);
    expect(h.settlements.findCurrent).toHaveBeenLastCalledWith(
      { organizationId: "org", contractId: financeContractId },
      h.tx,
    );
    expect(h.settlements.billIds).toHaveBeenCalledTimes(membershipCalls + 1);
    expect(h.settlements.billIds).toHaveBeenLastCalledWith(
      { organizationId: "org", contractId: financeContractId },
      settlementId,
      h.tx,
    );
    expect(h.source.read).toHaveBeenCalledTimes(sourceReads);
    expect(h.revisions.append).toHaveBeenCalledTimes(appendCalls);
    expect(h.readings.reviseBoundary).toHaveBeenCalledTimes(readingCalls);
    expect(h.projection.refresh).toHaveBeenCalledTimes(projectionCalls);
    expect(h.audit.appendRequired).toHaveBeenCalledTimes(auditCalls);
    expect(h.financeRequests.complete).toHaveBeenCalledTimes(requestCalls);
    expect(h.state()).toEqual(beforeReplay);
    await expect(h.service.adjust(revisionAuth as never, input as never)).resolves.toEqual(
      original,
    );
  });

  it("does not require settlement permission to replay a correction whose bill is unlinked", async () => {
    const h = harness();
    const authWithoutSettlementPermission = {
      ...revisionAuth,
      permissions: revisionAuth.permissions.filter(
        (permission) => permission !== "rental_settlements:confirm",
      ),
    };
    const inputContent = {
      billId: targetBillId,
      expectedVersion: "untrusted-version",
      readings: [],
      extraFees: [{ id: "monthly-extra", name: "清洁费", amountMinor: 500, note: "本月" }],
      reason: "只调整未纳入结算的账单",
    };
    const preview = await h.service.preview(
      authWithoutSettlementPermission as never,
      inputContent as never,
    );
    const input = {
      ...inputContent,
      expectedVersion: preview.version,
      idempotencyKey,
    };
    const original = await h.service.adjust(
      authWithoutSettlementPermission as never,
      input as never,
    );
    const reads = h.source.read.mock.calls.length;

    await expect(
      h.service.adjust(authWithoutSettlementPermission as never, input as never),
    ).resolves.toEqual(original);

    expect(h.source.read).toHaveBeenCalledTimes(reads);
    expect(h.settlements.findCurrent).toHaveBeenCalledTimes(1);
    expect(h.settlements.billIds).toHaveBeenCalledTimes(3);
    expect(h.settlements.billIds).toHaveBeenLastCalledWith(
      { organizationId: "org", contractId: financeContractId },
      settlementId,
      h.tx,
    );
    expect(h.access.assertPermission.mock.calls.map((call) => call[1])).not.toContain(
      "rental_settlements:confirm",
    );
    expect(h.financeRequests.complete).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of a completed idempotency key with different correction content", async () => {
    const h = harness();
    const preview = await h.service.preview(revisionAuth as never, h.previewInput as never);
    await h.service.adjust(
      revisionAuth as never,
      {
        ...h.previewInput,
        expectedVersion: preview.version,
        idempotencyKey,
      } as never,
    );

    await expect(
      h.service.adjust(
        revisionAuth as never,
        {
          ...h.previewInput,
          extraFees: [{ id: "other-extra", name: "另一项", amountMinor: 1, note: "" }],
          expectedVersion: preview.version,
          idempotencyKey,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.revisions.append).toHaveBeenCalledTimes(2);
    expect(h.financeRequests.complete).toHaveBeenCalledTimes(1);
  });

  it("persists stable bill, reading, cash, and before/after revision identities", async () => {
    const h = harness();
    const before = h.state();
    const preview = await h.service.preview(revisionAuth as never, h.previewInput as never);
    await h.service.adjust(
      revisionAuth as never,
      {
        ...h.previewInput,
        expectedVersion: preview.version,
        idempotencyKey,
      } as never,
    );
    const after = h.state();

    expect(after.bills.map(({ id }) => id)).toEqual(before.bills.map(({ id }) => id));
    expect(after.cashEntries.map(({ id }) => id)).toEqual(before.cashEntries.map(({ id }) => id));
    expect(after.readings.map(({ id }) => id)).toEqual(before.readings.map(({ id }) => id));
    expect(after.readings.find(({ id }) => id === "reading-boundary")?.reading).toBe("110");
    expect(after.billRevisions.map((item) => item.billId)).toEqual([targetBillId, adjacentBillId]);
    expect(after.billRevisions.map((item) => item.amountMinor)).toEqual([203_000, 208_000]);
    expect(after.bills.map(({ amountMinor }) => amountMinor)).toEqual([206_000, 204_000]);
    expect(after.settlement?.finalCostMinor).toBe(204_000);
    expect(after.cashEntries).toEqual(before.cashEntries);
  });

  it.each([
    "second bill",
    "projection",
    "audit",
    "request",
  ] as const)("rolls back every finance fact if failure happens after the %s write", async (failurePoint) => {
    const h = harness();
    const preview = await h.service.preview(revisionAuth as never, h.previewInput as never);
    const before = h.state();
    const append = h.revisions.append.getMockImplementation();
    const refresh = h.projection.refresh.getMockImplementation();
    const audit = h.audit.appendRequired.getMockImplementation();
    const complete = h.financeRequests.complete.getMockImplementation();
    if (failurePoint === "second bill") {
      let count = 0;
      h.revisions.append.mockImplementation(async (...args) => {
        const result = await append?.(...args);
        if (++count === 2) throw new Error("injected second bill failure");
        return result as never;
      });
    } else if (failurePoint === "projection") {
      h.projection.refresh.mockImplementation(async (...args) => {
        await refresh?.(...args);
        throw new Error("injected projection failure");
      });
    } else if (failurePoint === "audit") {
      h.audit.appendRequired.mockImplementation(async (...args) => {
        await audit?.(...args);
        throw new Error("injected audit failure");
      });
    } else {
      h.financeRequests.complete.mockImplementation(async (...args) => {
        await complete?.(...args);
        throw new Error("injected request failure");
      });
    }

    await expect(
      h.service.adjust(
        revisionAuth as never,
        {
          ...h.previewInput,
          expectedVersion: preview.version,
          idempotencyKey,
        } as never,
      ),
    ).rejects.toThrow("injected");
    expect(h.state()).toEqual(before);
    expect(h.savedRequest()).toBeNull();
  });

  it("replays the original two-bill response after a later correction without writing again", async () => {
    const h = harness();
    const originalPreview = await h.service.preview(revisionAuth as never, h.previewInput as never);
    const originalInput = {
      ...h.previewInput,
      expectedVersion: originalPreview.version,
      idempotencyKey,
    };
    const originalResult = await h.service.adjust(revisionAuth as never, originalInput as never);

    const laterInput = {
      ...h.previewInput,
      readings: [{ kind: "water", readingDate: "2026-09-30", reading: "108" }],
      reason: "后续更正",
    };
    const laterPreview = await h.service.preview(revisionAuth as never, laterInput as never);
    await h.service.adjust(
      revisionAuth as never,
      {
        ...laterInput,
        expectedVersion: laterPreview.version,
        idempotencyKey: "00000000-0000-4000-8000-000000000100",
      } as never,
    );
    const beforeReplay = h.state();
    const appendCount = h.revisions.append.mock.calls.length;
    const readCount = h.source.read.mock.calls.length;

    await expect(h.service.adjust(revisionAuth as never, originalInput as never)).resolves.toEqual(
      originalResult,
    );
    expect(h.revisions.append).toHaveBeenCalledTimes(appendCount);
    expect(h.source.read).toHaveBeenCalledTimes(readCount);
    expect(h.state()).toEqual(beforeReplay);
  });

  it("bounds history page size to one hundred inside the organization-scoped repository call", async () => {
    const h = harness();

    await h.service.history(revisionAuth as never, {
      billId: targetBillId,
      page: 2,
      pageSize: 500,
    });

    expect(h.revisions.history).toHaveBeenCalledWith(
      { organizationId: "org", contractId: financeContractId },
      targetBillId,
      { page: 2, pageSize: 100 },
      h.tx,
    );
  });

  it("rejects a preview whose candidate cost overflows the current cash balance", async () => {
    const source = negativeNetCashSnapshot();
    const h = harness(source);
    const before = h.state();
    expect(
      calculateRentalCashBalance(
        source.cashEntries,
        { kind: "bill", billId: targetBillId },
        0,
        "2026-09-30",
        source.context.today,
      ),
    ).toMatchObject({
      receivedMinor: 0,
      refundedMinor: 100,
      netReceivedMinor: -100,
      outstandingMinor: 100,
      state: "unpaid",
    });
    const input = {
      billId: targetBillId,
      expectedVersion: "untrusted-version",
      reason: "调整额外费用",
      extraFees: [
        { id: "large-extra", name: "额外费用", amountMinor: Number.MAX_SAFE_INTEGER, note: "" },
      ],
    };

    await expect(h.service.preview(revisionAuth as never, input as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.state()).toEqual(before);
    expect(h.revisions.append).not.toHaveBeenCalled();
    expect(h.readings.reviseBoundary).not.toHaveBeenCalled();
    expect(h.projection.refresh).not.toHaveBeenCalled();
    expect(h.audit.appendRequired).not.toHaveBeenCalled();
    expect(h.financeRequests.complete).not.toHaveBeenCalled();
  });

  it("rejects an unsafe adjusted balance before any financial writes", async () => {
    const source = negativeNetCashSnapshot();
    const h = harness(source);
    const input = {
      billId: targetBillId,
      expectedVersion: "untrusted-version",
      idempotencyKey: "00000000-0000-4000-8000-000000000101",
      reason: "调整额外费用",
      extraFees: [
        { id: "large-extra", name: "额外费用", amountMinor: Number.MAX_SAFE_INTEGER, note: "" },
      ],
    };
    const currentSource = await h.source.read();
    const expectedVersion = financeSourceVersion(
      { ...currentSource, settlementBillIds: [] },
      input,
    );
    const before = h.state();

    await expect(
      h.service.adjust(revisionAuth as never, { ...input, expectedVersion } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(h.state()).toEqual(before);
    expect(h.savedRequest(input.idempotencyKey)).toBeNull();
    expect(h.revisions.append).not.toHaveBeenCalled();
    expect(h.readings.reviseBoundary).not.toHaveBeenCalled();
    expect(h.projection.refresh).not.toHaveBeenCalled();
    expect(h.audit.appendRequired).not.toHaveBeenCalled();
    expect(h.financeRequests.complete).not.toHaveBeenCalled();

    const reads = new BillsReadService(
      h.bills as never,
      { readMany: vi.fn(async () => [cashProjectionFacts(source)]) } as never,
      {} as never,
      h.policy as never,
      { assertPermission: vi.fn() } as never,
      {
        run: async (operation: (tx: typeof h.tx) => Promise<unknown>) => operation(h.tx),
      } as never,
    );
    await expect(reads.detail(revisionAuth as never, { id: targetBillId })).resolves.toMatchObject({
      amountMinor: 0,
      financial: {
        receivedMinor: 0,
        refundedMinor: 100,
        netReceivedMinor: -100,
        outstandingMinor: 100,
        state: "unpaid",
      },
    });
  });

  it("checks the safe target and rejects an overflowing adjacent bill candidate", async () => {
    const source = sourceSnapshot();
    const adjacent = source.bills.find(({ id }) => id === adjacentBillId);
    const priorReceipt = source.cashEntries.find(
      (entry) => entry.target.kind === "bill" && entry.target.billId === targetBillId,
    );
    if (!adjacent || !priorReceipt) throw new Error("Two-bill correction fixture unavailable");

    adjacent.lines.push({
      kind: "extra_fee",
      label: "历史额外费用",
      amountMinor: Number.MAX_SAFE_INTEGER - 208_400,
      periodStart: null,
      periodEnd: null,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 2,
      note: "保留已保存费用",
      feeSnapshot: {
        kind: "extra_fee",
        extraFeeId: "large-adjacent-extra",
        origin: "monthly",
      },
    });
    adjacent.amountMinor = Number.MAX_SAFE_INTEGER - 400;
    source.cashEntries = [
      ...source.cashEntries.filter((entry) => entry.target.kind === "bill"),
      {
        ...priorReceipt,
        id: "cash-revoked-adjacent-receipt",
        target: { kind: "bill", billId: adjacentBillId },
        amountMinor: 100,
        revokedAt: "2026-09-30T00:00:00.000Z",
        revokedByUserId: "user",
        revokeReason: "撤销错误收款",
      },
      {
        ...priorReceipt,
        id: "cash-effective-adjacent-refund",
        target: { kind: "bill", billId: adjacentBillId },
        kind: "refund",
        purpose: "refund",
        amountMinor: 100,
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      },
    ];
    source.settlement = null;
    const h = harness(source);
    const input: RentalBillRevisionInput & { idempotencyKey: string } = {
      billId: targetBillId,
      expectedVersion: "untrusted-version",
      readings: [{ kind: "water", readingDate: "2026-09-30", reading: "99" }],
      reason: "更正共享读数",
      idempotencyKey: "00000000-0000-4000-8000-000000000102",
    };
    const currentSource = await h.source.read();
    const expectedVersion = financeSourceVersion(
      { ...currentSource, settlementBillIds: [] },
      input,
    );
    const before = h.state();
    const plan = buildMeterCorrectionPlan(source, input);
    const targetCandidate = plan.bills.find(({ billId }) => billId === targetBillId);
    const adjacentCandidate = plan.bills.find(({ billId }) => billId === adjacentBillId);
    if (!targetCandidate || !adjacentCandidate)
      throw new Error("Two-bill correction plan unavailable");

    expect(plan.bills.map(({ billId, amountMinor }) => ({ billId, amountMinor }))).toEqual([
      { billId: targetBillId, amountMinor: 202_700 },
      { billId: adjacentBillId, amountMinor: Number.MAX_SAFE_INTEGER },
    ]);

    expect(
      calculateRentalCashBalance(
        source.cashEntries,
        { kind: "bill", billId: targetBillId },
        source.bills.find(({ id }) => id === targetBillId)?.amountMinor ?? 0,
        "2026-09-30",
        source.context.today,
      ).outstandingMinor,
    ).toBe(0);
    expect(
      calculateRentalCashBalance(
        source.cashEntries,
        { kind: "bill", billId: adjacentBillId },
        adjacent.amountMinor,
        "2026-10-31",
        source.context.today,
      ).outstandingMinor,
    ).toBe(Number.MAX_SAFE_INTEGER - 300);
    expect(
      calculateRentalCashBalance(
        source.cashEntries,
        { kind: "bill", billId: targetBillId },
        targetCandidate.amountMinor,
        "2026-09-30",
        source.context.today,
      ).outstandingMinor,
    ).toBe(0);
    expect(() =>
      calculateRentalCashBalance(
        source.cashEntries,
        { kind: "bill", billId: adjacentBillId },
        adjacentCandidate.amountMinor,
        "2026-10-31",
        source.context.today,
      ),
    ).toThrow(RangeError);

    await expect(
      h.service.preview(revisionAuth as never, { ...input, expectedVersion } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      h.service.adjust(revisionAuth as never, { ...input, expectedVersion } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.state()).toEqual(before);
    expect(h.savedRequest(input.idempotencyKey)).toBeNull();
    expect(h.revisions.append).not.toHaveBeenCalled();
    expect(h.readings.reviseBoundary).not.toHaveBeenCalled();
    expect(h.projection.refresh).not.toHaveBeenCalled();
    expect(h.audit.appendRequired).not.toHaveBeenCalled();
    expect(h.financeRequests.complete).not.toHaveBeenCalled();
  });

  it("accepts the adjacent safe candidate balance at the MAX_SAFE boundary", async () => {
    const h = harness(negativeNetCashSnapshot());
    const preview = await h.service.preview(
      revisionAuth as never,
      {
        billId: targetBillId,
        expectedVersion: "untrusted-version",
        reason: "调整额外费用",
        extraFees: [
          {
            id: "large-extra",
            name: "额外费用",
            amountMinor: Number.MAX_SAFE_INTEGER - 100,
            note: "",
          },
        ],
      } as never,
    );

    expect(preview.affectedBills).toEqual([
      {
        billId: targetBillId,
        beforeAmountMinor: 0,
        afterAmountMinor: Number.MAX_SAFE_INTEGER - 100,
      },
    ]);
  });

  it("does not recompute an adjacent bill when the corrected period has no later bill", async () => {
    const source = sourceSnapshot();
    source.bills = source.bills.filter(({ id }) => id === targetBillId);
    source.readings = source.readings.filter(({ id }) => id !== "reading-next");
    source.settlement = null;
    source.cashEntries = source.cashEntries.filter((item) => item.target.kind === "bill");
    const h = harness(source);

    const preview = await h.service.preview(revisionAuth as never, h.previewInput as never);

    expect(preview.affectedBills).toEqual([
      { billId: targetBillId, beforeAmountMinor: 203_000, afterAmountMinor: 206_000 },
    ]);
    expect(preview.settlementDifferenceMinor).toBeNull();
  });
});
