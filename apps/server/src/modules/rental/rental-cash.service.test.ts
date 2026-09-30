import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { RentalCashTarget } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import {
  financeContractId,
  rentalFinanceAuth,
  rentalFinanceSnapshot,
} from "../../test/rental-finance-fixtures.js";
import { calculateRentalCashBalance } from "./rental-cash.rules.js";
import { RentalCashService } from "./rental-cash.service.js";
import { rentalCashSourceVersion } from "./rental-cash.version.rules.js";
import type { RentalFinanceSnapshot } from "./rental-finance.types.js";
import { financeRequestHash } from "./rental-finance-request.rules.js";

const billId = "00000000-0000-4000-8000-000000000030";
const receiptKey = "00000000-0000-4000-8000-000000000032";
const receiptAction = "rental_cash.receipt";
const settlementId = "00000000-0000-4000-8000-000000000034";
const target = { kind: "bill", billId } as const;
const settlementTarget = { kind: "settlement", settlementId } as const;

function financeSnapshot(cashEntries: RentalFinanceSnapshot["cashEntries"] = []) {
  return rentalFinanceSnapshot({
    bills: [
      {
        id: billId,
        contractId: financeContractId,
        propertyId: "00000000-0000-4000-8000-000000000002",
        type: "monthly",
        status: "active",
        modelVersion: 2,
        billingMonth: "2026-08",
        revision: 1,
        amountMinor: 300_000,
        dueDate: "2026-08-31",
      } as never,
    ],
    cashEntries,
  });
}

function projectionFacts(snapshot: RentalFinanceSnapshot) {
  return {
    organizationId: snapshot.context.organizationId,
    contractId: snapshot.context.contractId,
    contract: {
      billingMode: snapshot.contract.billingMode ?? null,
      lifecycleStatus: snapshot.contract.lifecycleStatus,
      terminationDate: snapshot.contract.terminationDate,
    },
    bills: snapshot.bills.map((bill) => ({
      id: bill.id,
      type: bill.type,
      status: bill.status,
      modelVersion: bill.modelVersion ?? null,
      revision: bill.revision ?? null,
      amountMinor: bill.amountMinor,
      sourceKey: bill.sourceKey,
    })),
    cashEntries: snapshot.cashEntries,
    settlement: snapshot.settlement
      ? {
          id: snapshot.settlement.id,
          eventId: snapshot.settlement.eventId,
          kind: snapshot.settlement.kind,
          effectiveEndDate: snapshot.settlement.effectiveEndDate,
          revision: snapshot.settlement.revision,
          finalCostMinor: snapshot.settlement.finalCostMinor,
          status: snapshot.settlement.status,
        }
      : null,
    settlementBillIds: [],
    readings: snapshot.readings.map(
      ({ id, kind, readingDate, reading, revision, predecessorId }) => ({
        id,
        kind,
        readingDate,
        reading,
        revision,
        predecessorId,
      }),
    ),
  };
}

function harness(initial = financeSnapshot()) {
  const tx = {};
  let snapshot = structuredClone(initial) as RentalFinanceSnapshot;
  const entries: Array<Record<string, unknown>> = initial.cashEntries.map((entry) => ({
    ...structuredClone(entry),
    billId: entry.target.kind === "bill" ? entry.target.billId : null,
    settlementId: entry.target.kind === "settlement" ? entry.target.settlementId : null,
    createdAt: new Date(entry.createdAt),
    revokedAt: entry.revokedAt ? new Date(entry.revokedAt) : null,
  }));
  let nextEntry = 0;
  let completedRequest: Record<string, unknown> | null = null;
  const cash = {
    allForContract: vi.fn(async () => structuredClone(entries) as never),
    list: vi.fn(async () => ({
      items: structuredClone(entries),
      total: entries.length,
      page: 1,
      pageSize: 20,
    })),
    insert: vi.fn(async (scope, input, actor) => {
      nextEntry += 1;
      const entry = {
        id: `00000000-0000-4000-8000-${String(nextEntry).padStart(12, "0")}`,
        ...scope,
        ...structuredClone(input),
        billId: input.target.kind === "bill" ? input.target.billId : null,
        settlementId: input.target.kind === "settlement" ? input.target.settlementId : null,
        createdAt: new Date("2026-09-30T00:00:00.000Z"),
        createdByUserId: actor.userId,
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      };
      entries.push(entry);
      snapshot = {
        ...snapshot,
        cashEntries: [
          ...snapshot.cashEntries,
          {
            id: entry.id,
            contractId: scope.contractId,
            target: input.target,
            kind: input.kind,
            purpose: input.purpose,
            amountMinor: input.amountMinor,
            occurredOn: input.occurredOn,
            note: input.note,
            createdAt: entry.createdAt.toISOString(),
            createdByUserId: actor.userId,
            revokedAt: null,
            revokedByUserId: null,
            revokeReason: null,
          },
        ],
      };
      return structuredClone(entry) as never;
    }),
    revoke: vi.fn(async (_scope, entryId, reason, actor) => {
      const record = entries.find((item) => item.id === entryId);
      if (!record) throw new Error("Missing test entry");
      Object.assign(record, {
        revokedAt: new Date(),
        revokedByUserId: actor.userId,
        revokeReason: reason,
      });
      snapshot = {
        ...snapshot,
        cashEntries: snapshot.cashEntries.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                revokedAt: new Date().toISOString(),
                revokedByUserId: actor.userId,
                revokeReason: reason,
              }
            : entry,
        ),
      };
      return structuredClone(record) as never;
    }),
    findContractIdByEntryId: vi.fn(async (): Promise<string | null> => financeContractId),
  };
  const sources = { read: vi.fn(async () => structuredClone(snapshot)) };
  const projectionSources = {
    readMany: vi.fn(async () => [structuredClone(projectionFacts(snapshot))]),
  };
  const financeRequests = {
    find: vi.fn(async (_scope, idempotencyKey) =>
      completedRequest?.idempotencyKey === idempotencyKey ? completedRequest : null,
    ),
    complete: vi.fn(async (scope, input) => {
      completedRequest = structuredClone({ ...scope, ...input });
    }),
  };
  const bills = {
    detail: vi.fn(
      async (_organizationId, id) => snapshot.bills.find((bill) => bill.id === id) ?? null,
    ),
    findGeneration: vi.fn(async () => null),
  };
  const settlements = {
    findContractId: vi.fn(async (): Promise<string | null> => null),
    findCurrent: vi.fn(async () => null),
  };
  const contracts = {
    find: vi.fn(async () => ({ propertyId: snapshot.contract.propertyId })),
    findForUpdate: vi.fn(async () => ({
      id: financeContractId,
      propertyId: snapshot.contract.propertyId,
    })),
  };
  const policy = {
    lockOrganizationContext: vi.fn(async () => ({ today: snapshot.context.today })),
    requireContract: vi.fn((value) => value),
    requireOwnedPropertyForUpdate: vi.fn(async () => ({ id: snapshot.contract.propertyId })),
  };
  const projection = {
    refresh: vi.fn(async () => {
      const current = snapshot.settlement;
      if (!current) return null;
      snapshot = {
        ...snapshot,
        settlement: {
          ...current,
          revision: current.revision + 1,
        },
      };
      const version = rentalCashSourceVersion(projectionFacts(snapshot), settlementTarget);
      const refreshed = snapshot.settlement;
      if (!refreshed) throw new Error("Settlement disappeared during test refresh");
      snapshot = {
        ...snapshot,
        settlement: {
          ...refreshed,
          version,
          balance: { ...refreshed.balance, version },
        },
      };
      return structuredClone(snapshot.settlement);
    }),
  };
  const audit = { appendRequired: vi.fn() };
  const access = { assertPermission: vi.fn() };
  const transactions = { run: vi.fn((operation) => operation(tx)) };
  const service = new RentalCashService(
    sources as never,
    projectionSources as never,
    cash as never,
    bills as never,
    settlements as never,
    financeRequests as never,
    contracts as never,
    policy as never,
    projection as never,
    access as never,
    audit as never,
    transactions as never,
  );
  return {
    service,
    entries,
    sources,
    bills,
    cash,
    settlements,
    projectionSources,
    financeRequests,
    projection,
    audit,
    access,
    transactions,
    tx,
    snapshot: () => structuredClone(snapshot),
    setSnapshot: (next: RentalFinanceSnapshot) => {
      snapshot = structuredClone(next);
    },
    version: (versionTarget: RentalCashTarget = target) =>
      rentalCashSourceVersion(projectionFacts(snapshot), versionTarget),
  };
}

function enforcePermissions(h: ReturnType<typeof harness>) {
  h.access.assertPermission.mockImplementation((auth, requiredPermission) => {
    const context = auth as { isSuperAdmin: boolean; permissions: readonly string[] };
    if (!context.isSuperAdmin && !context.permissions.includes(String(requiredPermission))) {
      throw new ForbiddenException("缺少所需权限");
    }
  });
}

function cashAuth(...permissions: string[]) {
  return { ...rentalFinanceAuth, permissions };
}

function depositSnapshot(cashEntries: RentalFinanceSnapshot["cashEntries"] = []) {
  const base = rentalFinanceSnapshot({ cashEntries });
  return {
    ...base,
    bills: [
      {
        id: billId,
        contractId: financeContractId,
        propertyId: "00000000-0000-4000-8000-000000000002",
        type: "deposit",
        status: "active",
        modelVersion: 2,
        billingMonth: null,
        revision: 1,
        amountMinor: 300_000,
        dueDate: "2026-08-31",
        lines: [{ id: "deposit-line", kind: "deposit", amountMinor: 300_000 }],
      } as never,
    ],
  } as RentalFinanceSnapshot;
}

function settlementSnapshot(cashEntries: RentalFinanceSnapshot["cashEntries"] = []) {
  const base = rentalFinanceSnapshot({ cashEntries });
  return {
    ...base,
    settlement: {
      id: settlementId,
      contractId: financeContractId,
      eventId: "00000000-0000-4000-8000-000000000035",
      kind: "termination",
      effectiveEndDate: "2026-08-31",
      version: "saved-settlement-version",
      revision: 1,
      finalCostMinor: 200_000,
      balance: {
        receivedMinor: 300_000,
        refundedMinor: 0,
        netReceivedMinor: 300_000,
        outstandingMinor: 0,
        refundableMinor: 100_000,
        state: "refundable",
        overdue: false,
        version: "saved-settlement-version",
      },
      status: "pending_refund",
      confirmedAt: "2026-09-01T00:00:00.000Z",
      confirmedByUserId: "user",
    } as never,
  } as RentalFinanceSnapshot;
}

function highValueCashSnapshot(billAmountMinor: number) {
  const max = Number.MAX_SAFE_INTEGER;
  const snapshot = financeSnapshot([
    {
      id: "cash-large-receipt",
      contractId: financeContractId,
      target,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: max,
      occurredOn: "2026-09-01",
      note: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    },
    {
      id: "cash-large-refund",
      contractId: financeContractId,
      target,
      kind: "refund",
      purpose: "refund",
      amountMinor: max,
      occurredOn: "2026-09-02",
      note: null,
      createdAt: new Date("2026-09-02T00:00:00.000Z").toISOString(),
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    },
  ] as never);
  (snapshot.bills[0] as never as { amountMinor: number }).amountMinor = billAmountMinor;
  return snapshot;
}

describe("RentalCashService", () => {
  it("requires the exact target read permission for new cash writes and revokes", async () => {
    const bill = harness();
    enforcePermissions(bill);
    const billBefore = bill.snapshot();
    await expect(
      bill.service.recordReceipt(
        cashAuth("rental_receipts:create", "rental_settlements:read") as never,
        {
          target,
          amountMinor: 100_000,
          occurredOn: "2026-09-30",
          expectedVersion: bill.version(),
          idempotencyKey: receiptKey,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(bill.snapshot()).toEqual(billBefore);
    expect(bill.cash.insert).not.toHaveBeenCalled();
    expect(bill.financeRequests.find).not.toHaveBeenCalled();

    const paidBill = financeSnapshot([
      {
        id: "cash-refund-write-permission-source",
        contractId: financeContractId,
        target,
        kind: "receipt",
        purpose: "bill_receipt",
        amountMinor: 300_000,
        occurredOn: "2026-09-01",
        note: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        createdByUserId: "user",
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      },
    ] as never);
    const refund = harness(paidBill);
    enforcePermissions(refund);
    const refundBefore = refund.snapshot();
    await expect(
      refund.service.confirmRefund(
        cashAuth("rental_refunds:create", "rental_settlements:read") as never,
        {
          target,
          occurredOn: "2026-09-30",
          expectedVersion: refund.version(),
          idempotencyKey: "00000000-0000-4000-8000-000000000066",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(refund.snapshot()).toEqual(refundBefore);
    expect(refund.cash.insert).not.toHaveBeenCalled();
    expect(refund.financeRequests.find).not.toHaveBeenCalled();

    const settlement = harness({
      ...financeSnapshot(),
      settlement: settlementSnapshot().settlement,
    } as RentalFinanceSnapshot);
    enforcePermissions(settlement);
    settlement.settlements.findContractId.mockResolvedValue(financeContractId);
    const settlementBefore = settlement.snapshot();
    await expect(
      settlement.service.recordReceipt(
        cashAuth("rental_receipts:create", "rental_bills:read") as never,
        {
          target: settlementTarget,
          amountMinor: 1_000,
          occurredOn: "2026-09-30",
          expectedVersion: settlement.version(settlementTarget),
          idempotencyKey: "00000000-0000-4000-8000-000000000058",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(settlement.snapshot()).toEqual(settlementBefore);
    expect(settlement.cash.insert).not.toHaveBeenCalled();
    expect(settlement.financeRequests.find).not.toHaveBeenCalled();

    const deposit = harness(depositSnapshot());
    enforcePermissions(deposit);
    const depositBefore = deposit.snapshot();
    await expect(
      deposit.service.confirmDepositReceipt(
        cashAuth("rental_receipts:create", "rental_settlements:read") as never,
        {
          billId,
          occurredOn: "2026-09-30",
          expectedVersion: deposit.version(target),
          idempotencyKey: "00000000-0000-4000-8000-000000000059",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deposit.snapshot()).toEqual(depositBefore);
    expect(deposit.cash.insert).not.toHaveBeenCalled();
    expect(deposit.financeRequests.find).not.toHaveBeenCalled();

    for (const kind of ["receipt", "refund"] as const) {
      const entry = {
        id: `cash-${kind}-revoke-write-permission`,
        contractId: financeContractId,
        target,
        kind,
        purpose: kind === "receipt" ? "bill_receipt" : "refund",
        amountMinor: 100_000,
        occurredOn: "2026-09-01",
        note: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        createdByUserId: "user",
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      };
      const revokeHarness = harness(financeSnapshot([entry] as never));
      enforcePermissions(revokeHarness);
      const before = revokeHarness.snapshot();
      const request = {
        entryId: entry.id,
        reason: "误登记",
        expectedVersion: revokeHarness.version(target),
        idempotencyKey:
          kind === "receipt"
            ? "00000000-0000-4000-8000-000000000070"
            : "00000000-0000-4000-8000-000000000071",
      };
      const operation =
        kind === "receipt"
          ? revokeHarness.service.revokeReceipt(
              cashAuth("rental_receipts:revoke", "rental_settlements:read") as never,
              request as never,
            )
          : revokeHarness.service.revokeRefund(
              cashAuth("rental_refunds:revoke", "rental_settlements:read") as never,
              request as never,
            );

      await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
      expect(revokeHarness.snapshot()).toEqual(before);
      expect(revokeHarness.cash.revoke).not.toHaveBeenCalled();
      expect(revokeHarness.financeRequests.find).not.toHaveBeenCalled();
    }
  });

  it("requires the exact target read again before replaying completed cash and revoke keys", async () => {
    const bill = harness();
    enforcePermissions(bill);
    const billRequest = {
      target,
      amountMinor: 100_000,
      occurredOn: "2026-09-30",
      expectedVersion: bill.version(),
      idempotencyKey: receiptKey,
    };
    await bill.service.recordReceipt(
      cashAuth("rental_receipts:create", "rental_bills:read") as never,
      billRequest as never,
    );
    const billBeforeReplay = bill.snapshot();
    await expect(
      bill.service.recordReceipt(
        cashAuth("rental_receipts:create", "rental_settlements:read") as never,
        billRequest as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(bill.snapshot()).toEqual(billBeforeReplay);
    expect(bill.financeRequests.find).toHaveBeenCalledTimes(1);
    expect(bill.cash.insert).toHaveBeenCalledTimes(1);

    const refundSnapshot = financeSnapshot([
      {
        id: "cash-refund-replay-permission-source",
        contractId: financeContractId,
        target,
        kind: "receipt",
        purpose: "bill_receipt",
        amountMinor: 300_000,
        occurredOn: "2026-09-01",
        note: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        createdByUserId: "user",
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      },
    ] as never);
    (refundSnapshot.bills[0] as never as { amountMinor: number }).amountMinor = 200_000;
    const refund = harness(refundSnapshot);
    enforcePermissions(refund);
    const refundRequest = {
      target,
      occurredOn: "2026-09-30",
      expectedVersion: refund.version(),
      idempotencyKey: "00000000-0000-4000-8000-000000000067",
    };
    await refund.service.confirmRefund(
      cashAuth("rental_refunds:create", "rental_bills:read") as never,
      refundRequest as never,
    );
    const refundBeforeReplay = refund.snapshot();
    await expect(
      refund.service.confirmRefund(
        cashAuth("rental_refunds:create", "rental_settlements:read") as never,
        refundRequest as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(refund.snapshot()).toEqual(refundBeforeReplay);
    expect(refund.financeRequests.find).toHaveBeenCalledTimes(1);
    expect(refund.cash.insert).toHaveBeenCalledTimes(1);

    const settlement = harness({
      ...financeSnapshot(),
      settlement: settlementSnapshot().settlement,
    } as RentalFinanceSnapshot);
    enforcePermissions(settlement);
    settlement.settlements.findContractId.mockResolvedValue(financeContractId);
    const settlementRequest = {
      target: settlementTarget,
      amountMinor: 1_000,
      occurredOn: "2026-09-30",
      expectedVersion: settlement.version(settlementTarget),
      idempotencyKey: "00000000-0000-4000-8000-000000000060",
    };
    await settlement.service.recordReceipt(
      cashAuth("rental_receipts:create", "rental_settlements:read") as never,
      settlementRequest as never,
    );
    const settlementBeforeReplay = settlement.snapshot();
    await expect(
      settlement.service.recordReceipt(
        cashAuth("rental_receipts:create", "rental_bills:read") as never,
        settlementRequest as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(settlement.snapshot()).toEqual(settlementBeforeReplay);
    expect(settlement.financeRequests.find).toHaveBeenCalledTimes(1);
    expect(settlement.cash.insert).toHaveBeenCalledTimes(1);

    const deposit = harness(depositSnapshot());
    enforcePermissions(deposit);
    const depositRequest = {
      billId,
      occurredOn: "2026-09-30",
      expectedVersion: deposit.version(target),
      idempotencyKey: "00000000-0000-4000-8000-000000000061",
    };
    await deposit.service.confirmDepositReceipt(
      cashAuth("rental_receipts:create", "rental_bills:read") as never,
      depositRequest as never,
    );
    const depositBeforeReplay = deposit.snapshot();
    await expect(
      deposit.service.confirmDepositReceipt(
        cashAuth("rental_receipts:create", "rental_settlements:read") as never,
        depositRequest as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deposit.snapshot()).toEqual(depositBeforeReplay);
    expect(deposit.financeRequests.find).toHaveBeenCalledTimes(1);
    expect(deposit.cash.insert).toHaveBeenCalledTimes(1);

    const receipt = {
      id: "cash-receipt-revoke-permission",
      contractId: financeContractId,
      target,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 100_000,
      occurredOn: "2026-09-01",
      note: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    };
    const receiptRevoke = harness(financeSnapshot([receipt] as never));
    enforcePermissions(receiptRevoke);
    const receiptRevokeRequest = {
      entryId: receipt.id,
      reason: "误登记",
      expectedVersion: receiptRevoke.version(target),
      idempotencyKey: "00000000-0000-4000-8000-000000000062",
    };
    await receiptRevoke.service.revokeReceipt(
      cashAuth("rental_receipts:revoke", "rental_bills:read") as never,
      receiptRevokeRequest as never,
    );
    const receiptRevokeBeforeReplay = receiptRevoke.snapshot();
    await expect(
      receiptRevoke.service.revokeReceipt(
        cashAuth("rental_receipts:revoke", "rental_settlements:read") as never,
        receiptRevokeRequest as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(receiptRevoke.snapshot()).toEqual(receiptRevokeBeforeReplay);
    expect(receiptRevoke.financeRequests.find).toHaveBeenCalledTimes(1);
    expect(receiptRevoke.cash.revoke).toHaveBeenCalledTimes(1);

    const refundEntry = { ...receipt, id: "cash-refund-revoke-permission", kind: "refund" };
    const refundRevoke = harness(financeSnapshot([refundEntry] as never));
    enforcePermissions(refundRevoke);
    const refundRevokeRequest = {
      entryId: refundEntry.id,
      reason: "误登记",
      expectedVersion: refundRevoke.version(target),
      idempotencyKey: "00000000-0000-4000-8000-000000000063",
    };
    await refundRevoke.service.revokeRefund(
      cashAuth("rental_refunds:revoke", "rental_bills:read") as never,
      refundRevokeRequest as never,
    );
    const refundRevokeBeforeReplay = refundRevoke.snapshot();
    await expect(
      refundRevoke.service.revokeRefund(
        cashAuth("rental_refunds:revoke", "rental_settlements:read") as never,
        refundRevokeRequest as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(refundRevoke.snapshot()).toEqual(refundRevokeBeforeReplay);
    expect(refundRevoke.financeRequests.find).toHaveBeenCalledTimes(1);
    expect(refundRevoke.cash.revoke).toHaveBeenCalledTimes(1);
  });

  it("checks cash list permission for its exact bill or settlement target", async () => {
    const h = harness();
    const auth = { ...rentalFinanceAuth, permissions: ["rental_bills:read"] };
    await h.service.list(auth as never, { target, page: 1, pageSize: 20 });

    h.setSnapshot({
      ...h.snapshot(),
      settlement: settlementSnapshot().settlement,
    } as RentalFinanceSnapshot);
    h.settlements.findContractId.mockResolvedValue(financeContractId);
    await h.service.list(
      { ...rentalFinanceAuth, permissions: ["rental_settlements:read"] } as never,
      { target: settlementTarget, page: 1, pageSize: 20 },
    );

    expect(h.access.assertPermission).toHaveBeenNthCalledWith(1, auth, "rental_bills:read");
    expect(h.access.assertPermission).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ permissions: ["rental_settlements:read"] }),
      "rental_settlements:read",
    );
  });

  it("records a partial 100000 receipt against a 300000 bill", async () => {
    const h = harness();
    const request = {
      target,
      amountMinor: 100_000,
      occurredOn: "2026-09-30",
      expectedVersion: h.version(),
      idempotencyKey: receiptKey,
    };

    await expect(
      h.service.recordReceipt(rentalFinanceAuth as never, request as never),
    ).resolves.toMatchObject({
      target,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 100_000,
    });
    expect(h.entries).toHaveLength(1);
    expect(h.cash.insert).toHaveBeenCalledWith(
      { organizationId: "org", contractId: financeContractId },
      expect.objectContaining({ amountMinor: 100_000, target }),
      { userId: "user" },
      h.tx,
    );
  });

  it("rejects a 120000 receipt when only 100000 remains", async () => {
    const priorReceipt = {
      id: "cash-prior",
      contractId: financeContractId,
      target,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 200_000,
      occurredOn: "2026-09-01",
      note: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    };
    const h = harness(financeSnapshot([priorReceipt] as never));
    const request = {
      target,
      amountMinor: 120_000,
      occurredOn: "2026-09-30",
      expectedVersion: h.version(),
      idempotencyKey: "00000000-0000-4000-8000-000000000033",
    };

    await expect(
      h.service.recordReceipt(rentalFinanceAuth as never, request as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.cash.insert).not.toHaveBeenCalled();
  });

  it("rejects a receipt that makes the target's effective received total unsafe", async () => {
    const receiptHarness = harness(highValueCashSnapshot(200_000));
    const receiptBefore = receiptHarness.snapshot();

    await expect(
      receiptHarness.service.recordReceipt(
        rentalFinanceAuth as never,
        {
          target,
          amountMinor: 1,
          occurredOn: "2026-09-30",
          expectedVersion: receiptHarness.version(),
          idempotencyKey: "00000000-0000-4000-8000-000000000068",
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(receiptHarness.snapshot()).toEqual(receiptBefore);
    expect(receiptHarness.cash.insert).not.toHaveBeenCalled();
    expect(receiptHarness.financeRequests.complete).not.toHaveBeenCalled();
  });

  it("rejects receipt revocation when its resulting target outstanding exceeds the safe range", async () => {
    const max = Number.MAX_SAFE_INTEGER;
    const revokeHarness = harness(highValueCashSnapshot(max));
    const revokeBefore = revokeHarness.snapshot();
    await expect(
      revokeHarness.service.revokeReceipt(
        rentalFinanceAuth as never,
        {
          entryId: "cash-large-receipt",
          reason: "撤销后余额超安全整数范围",
          expectedVersion: revokeHarness.version(),
          idempotencyKey: "00000000-0000-4000-8000-000000000069",
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(revokeHarness.snapshot()).toEqual(revokeBefore);
    expect(revokeHarness.cash.revoke).not.toHaveBeenCalled();
    expect(revokeHarness.financeRequests.complete).not.toHaveBeenCalled();
  });

  it("serializes two attempts to collect the same remaining 100000 in the test transaction adapter", async () => {
    const priorReceipt = {
      id: "cash-prior",
      contractId: financeContractId,
      target,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 200_000,
      occurredOn: "2026-09-01",
      note: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    };
    const h = harness(financeSnapshot([priorReceipt] as never));
    let tail = Promise.resolve();
    h.transactions.run.mockImplementation((operation) => {
      const next = tail.then(() => operation(h.tx));
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    });
    const attempt = (idempotencyKey: string) =>
      h.service.recordReceipt(
        rentalFinanceAuth as never,
        {
          target,
          amountMinor: 100_000,
          occurredOn: "2026-09-30",
          expectedVersion: h.version(),
          idempotencyKey,
        } as never,
      );

    const results = await Promise.allSettled([
      attempt("00000000-0000-4000-8000-000000000051"),
      attempt("00000000-0000-4000-8000-000000000052"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.any(ConflictException),
    });
    expect(h.entries).toHaveLength(2);
    expect(h.cash.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects an old read version but replays an already completed identical key first", async () => {
    const h = harness();
    const request = {
      target,
      amountMinor: 100_000,
      occurredOn: "2026-09-30",
      expectedVersion: "old-financial-version",
      idempotencyKey: receiptKey,
    };
    await expect(
      h.service.recordReceipt(rentalFinanceAuth as never, request as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.cash.insert).not.toHaveBeenCalled();

    const completed = {
      id: "cash-completed",
      contractId: financeContractId,
      target,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 100_000,
      occurredOn: "2026-09-30",
      note: null,
      createdAt: "2026-09-30T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    };
    h.financeRequests.find.mockResolvedValueOnce({
      organizationId: "org",
      contractId: financeContractId,
      action: receiptAction,
      requestHash: financeRequestHash(receiptAction, request),
      result: { resourceId: completed.id, resourceKind: "cash" },
    } as never);
    h.sources.read.mockResolvedValueOnce({ ...h.snapshot(), cashEntries: [completed] } as never);

    await expect(
      h.service.recordReceipt(rentalFinanceAuth as never, request as never),
    ).resolves.toMatchObject({
      id: completed.id,
      amountMinor: 100_000,
    });
    expect(h.cash.insert).not.toHaveBeenCalled();
    expect(h.financeRequests.complete).not.toHaveBeenCalled();
  });

  it("rejects a completed key reused with different receipt content or a refund action", async () => {
    const h = harness();
    const original = {
      target,
      amountMinor: 50_000,
      occurredOn: "2026-09-30",
      expectedVersion: h.version(),
      idempotencyKey: "00000000-0000-4000-8000-000000000053",
    };
    await h.service.recordReceipt(rentalFinanceAuth as never, original as never);

    await expect(
      h.service.recordReceipt(
        rentalFinanceAuth as never,
        {
          ...original,
          amountMinor: 60_000,
          expectedVersion: h.version(),
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      h.service.confirmRefund(
        rentalFinanceAuth as never,
        {
          target,
          occurredOn: original.occurredOn,
          expectedVersion: h.version(),
          idempotencyKey: original.idempotencyKey,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(h.cash.insert).toHaveBeenCalledTimes(1);
    expect(h.financeRequests.complete).toHaveBeenCalledTimes(1);
  });

  it("rejects a key already claimed by bill generation", async () => {
    const h = harness();
    h.bills.findGeneration.mockResolvedValueOnce({ id: "existing-generation" } as never);
    await expect(
      h.service.recordReceipt(
        rentalFinanceAuth as never,
        {
          target,
          amountMinor: 1,
          occurredOn: "2026-09-30",
          expectedVersion: h.version(),
          idempotencyKey: "00000000-0000-4000-8000-000000000054",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.cash.insert).not.toHaveBeenCalled();
  });

  it("confirms the exact deposit amount only once and preserves the original receipt for replay", async () => {
    const h = harness(depositSnapshot());
    const request = {
      billId,
      occurredOn: "2026-09-30",
      expectedVersion: h.version(target),
      idempotencyKey: "00000000-0000-4000-8000-000000000036",
    };

    const first = await h.service.confirmDepositReceipt(
      rentalFinanceAuth as never,
      request as never,
    );
    await expect(
      h.service.confirmDepositReceipt(rentalFinanceAuth as never, request as never),
    ).resolves.toMatchObject({
      id: first.id,
      amountMinor: 300_000,
      purpose: "deposit_receipt",
    });
    expect(h.cash.insert).toHaveBeenCalledTimes(1);

    const newKey = {
      ...request,
      expectedVersion: h.version(target),
      idempotencyKey: "00000000-0000-4000-8000-000000000037",
    };
    await expect(
      h.service.confirmDepositReceipt(rentalFinanceAuth as never, newKey as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.cash.insert).toHaveBeenCalledTimes(1);
  });

  it("keeps a paid deposit disabled after a refund and replays its completed key after settlement", async () => {
    const h = harness(depositSnapshot());
    const request = {
      billId,
      occurredOn: "2026-09-30",
      expectedVersion: h.version(target),
      idempotencyKey: "00000000-0000-4000-8000-000000000038",
    };
    const first = await h.service.confirmDepositReceipt(
      rentalFinanceAuth as never,
      request as never,
    );
    const refundedDeposit = {
      ...h.snapshot(),
      cashEntries: [
        ...h.snapshot().cashEntries,
        {
          id: "deposit-refund",
          contractId: financeContractId,
          target,
          kind: "refund",
          purpose: "refund",
          amountMinor: 300_000,
          occurredOn: "2026-09-30",
          note: null,
          createdAt: "2026-09-30T00:00:00.000Z",
          createdByUserId: "user",
          revokedAt: null,
          revokedByUserId: null,
          revokeReason: null,
        },
      ],
    } as RentalFinanceSnapshot;
    h.setSnapshot(refundedDeposit);
    await expect(
      h.service.confirmDepositReceipt(
        rentalFinanceAuth as never,
        {
          ...request,
          expectedVersion: h.version(target),
          idempotencyKey: "00000000-0000-4000-8000-000000000039",
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const settled = {
      ...h.snapshot(),
      bills: h.snapshot().bills.map((bill) => ({ ...bill, status: "voided" as const })),
      settlement: settlementSnapshot().settlement,
    } as RentalFinanceSnapshot;
    h.setSnapshot(settled);
    await expect(
      h.service.confirmDepositReceipt(rentalFinanceAuth as never, request as never),
    ).resolves.toMatchObject({
      id: first.id,
      amountMinor: 300_000,
    });
    await expect(
      h.service.confirmDepositReceipt(
        rentalFinanceAuth as never,
        {
          ...request,
          expectedVersion: h.version(target),
          idempotencyKey: "00000000-0000-4000-8000-000000000040",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.cash.insert).toHaveBeenCalledTimes(1);
  });

  it("refunds the full corrected bill difference and accepts a newer version after another correction", async () => {
    const priorReceipt = {
      id: "cash-prior",
      contractId: financeContractId,
      target,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 300_000,
      occurredOn: "2026-09-01",
      note: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    };
    const initial = financeSnapshot([priorReceipt] as never);
    const initialBill = initial.bills[0];
    if (!initialBill) throw new Error("Monthly bill fixture missing");
    initialBill.amountMinor = 200_000;
    const h = harness(initial);
    const request = {
      target,
      occurredOn: "2026-09-30",
      expectedVersion: h.version(target),
      idempotencyKey: "00000000-0000-4000-8000-000000000041",
    };

    const first = await h.service.confirmRefund(rentalFinanceAuth as never, request as never);
    expect(first).toMatchObject({ target, amountMinor: 100_000, purpose: "refund" });
    await expect(
      h.service.confirmRefund(rentalFinanceAuth as never, request as never),
    ).resolves.toMatchObject({
      id: first.id,
      amountMinor: 100_000,
    });
    expect(h.cash.insert).toHaveBeenCalledTimes(1);

    const corrected = {
      ...h.snapshot(),
      bills: h.snapshot().bills.map((bill) => ({ ...bill, amountMinor: 190_000 })),
    } as RentalFinanceSnapshot;
    h.setSnapshot(corrected);
    await expect(
      h.service.confirmRefund(
        rentalFinanceAuth as never,
        {
          ...request,
          idempotencyKey: "00000000-0000-4000-8000-000000000058",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const second = await h.service.confirmRefund(
      rentalFinanceAuth as never,
      {
        ...request,
        expectedVersion: h.version(target),
        idempotencyKey: "00000000-0000-4000-8000-000000000042",
      } as never,
    );
    expect(second.amountMinor).toBe(10_000);
    expect(h.cash.insert.mock.calls.map((call) => call[1].amountMinor)).toEqual([100_000, 10_000]);
  });

  it("rejects a delayed original-bill receipt after settlement and leaves its existing cash target intact", async () => {
    const h = harness({
      ...financeSnapshot(),
      settlement: settlementSnapshot().settlement,
    } as RentalFinanceSnapshot);
    const request = {
      target,
      amountMinor: 50_000,
      occurredOn: "2026-09-30",
      expectedVersion: h.version(target),
      idempotencyKey: "00000000-0000-4000-8000-000000000043",
    };

    await expect(
      h.service.recordReceipt(rentalFinanceAuth as never, request as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.cash.insert).not.toHaveBeenCalled();
    expect(h.snapshot().cashEntries).toEqual([]);
  });

  it("appends a receipt revoke without changing its recorded amount", async () => {
    const receipt = {
      id: "cash-to-revoke",
      contractId: financeContractId,
      target,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 100_000,
      occurredOn: "2026-09-01",
      note: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    };
    const h = harness(financeSnapshot([receipt] as never));
    const request = {
      entryId: receipt.id,
      reason: "误登记",
      expectedVersion: h.version(target),
      idempotencyKey: "00000000-0000-4000-8000-000000000044",
    };

    await expect(
      h.service.revokeReceipt(rentalFinanceAuth as never, request as never),
    ).resolves.toMatchObject({
      id: receipt.id,
      amountMinor: 100_000,
      revokeReason: "误登记",
      revokedAt: expect.any(String),
    });
    expect(h.cash.revoke).toHaveBeenCalledWith(
      { organizationId: "org", contractId: financeContractId },
      receipt.id,
      "误登记",
      { userId: "user" },
      h.tx,
    );
  });

  it("reopens refundable balance after refund revoke and replays only the original fact", async () => {
    const receipt = {
      id: "cash-paid-before-refund-revoke",
      contractId: financeContractId,
      target,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 300_000,
      occurredOn: "2026-09-01",
      note: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    };
    const refund = {
      ...receipt,
      id: "cash-refund-to-revoke",
      kind: "refund",
      purpose: "refund",
      amountMinor: 100_000,
      occurredOn: "2026-09-10",
    };
    const snapshot = financeSnapshot([receipt, refund] as never);
    const monthly = snapshot.bills[0] as never as { amountMinor: number };
    monthly.amountMinor = 200_000;
    const h = harness(snapshot);
    const oldVersion = h.version(target);
    const request = {
      entryId: refund.id,
      reason: "退款误登记",
      expectedVersion: oldVersion,
      idempotencyKey: "00000000-0000-4000-8000-000000000064",
    };

    const revoked = await h.service.revokeRefund(rentalFinanceAuth as never, request as never);
    expect(revoked).toMatchObject({
      id: refund.id,
      amountMinor: 100_000,
      kind: "refund",
      revokedByUserId: rentalFinanceAuth.userId,
      revokeReason: request.reason,
      revokedAt: expect.any(String),
    });
    const persisted = h.snapshot().cashEntries.find((entry) => entry.id === refund.id);
    expect(persisted).toMatchObject({
      id: refund.id,
      amountMinor: 100_000,
      revokedByUserId: rentalFinanceAuth.userId,
      revokeReason: request.reason,
      revokedAt: expect.any(String),
    });
    expect(
      calculateRentalCashBalance(
        h.snapshot().cashEntries,
        target,
        200_000,
        "2026-08-31",
        h.snapshot().context.today,
      ).refundableMinor,
    ).toBe(100_000);

    await expect(
      h.service.revokeRefund(rentalFinanceAuth as never, request as never),
    ).resolves.toMatchObject({ id: refund.id, amountMinor: refund.amountMinor });
    expect(h.cash.revoke).toHaveBeenCalledTimes(1);
    expect(h.financeRequests.complete).toHaveBeenCalledTimes(1);

    await expect(
      h.service.revokeRefund(
        rentalFinanceAuth as never,
        {
          ...request,
          idempotencyKey: "00000000-0000-4000-8000-000000000065",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.cash.revoke).toHaveBeenCalledTimes(1);
  });

  it("does not expose a cash UUID outside its organization scope", async () => {
    const h = harness();
    h.cash.findContractIdByEntryId.mockResolvedValueOnce(null);
    await expect(
      h.service.revokeReceipt(
        rentalFinanceAuth as never,
        {
          entryId: "00000000-0000-4000-8000-000000000055",
          reason: "跨组织测试",
          expectedVersion: h.version(),
          idempotencyKey: "00000000-0000-4000-8000-000000000056",
        } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.sources.read).not.toHaveBeenCalled();
  });

  it("rejects revoking a receipt through the refund revoke endpoint", async () => {
    const receipt = {
      id: "cash-receipt-for-refund-route",
      contractId: financeContractId,
      target,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 10_000,
      occurredOn: "2026-09-01",
      note: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      createdByUserId: "user",
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    };
    const h = harness(financeSnapshot([receipt] as never));
    await expect(
      h.service.revokeRefund(
        rentalFinanceAuth as never,
        {
          entryId: receipt.id,
          reason: "错误入口",
          expectedVersion: h.version(target),
          idempotencyKey: "00000000-0000-4000-8000-000000000057",
        } as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.cash.revoke).not.toHaveBeenCalled();
  });
});
