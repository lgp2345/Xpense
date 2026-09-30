import { describe, expect, it, vi } from "vitest";
import { rentalBillingSource } from "../../test/rental-billing-fixtures.js";
import { RentalFinanceSourceService } from "./rental-finance-source.service.js";

describe("RentalFinanceSourceService", () => {
  it("loads the whole scoped finance snapshot through the supplied executor", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T04:00:00.000Z"));
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ baseCurrency: "CNY", timezone: "Asia/Shanghai" }]),
    };
    const tx = { select: vi.fn().mockReturnValue(query) };
    const source = rentalBillingSource();
    const detail = {
      ...source.contract,
      billingMode: "monthly_settlement",
      createdAt: new Date(source.contract.createdAt),
      updatedAt: new Date(source.contract.updatedAt),
    };
    const head = {
      id: source.contract.id,
      organizationId: source.organizationId,
      propertyId: source.contract.propertyId,
      cancelledAt: new Date("2026-08-30T18:00:00.000Z"),
      terminationRecordedAt: null,
    };
    const historicalBill = {
      id: "voided-bill-1",
      contractId: source.contract.id,
      status: "voided",
      type: "monthly",
      modelVersion: 2,
      billingMonth: "2026-07",
      revision: 1,
      amountMinor: 900,
      lines: [],
    };
    const bills = {
      activeForContract: vi.fn().mockResolvedValue(source.activeBills),
      allForContract: vi.fn().mockResolvedValue([historicalBill]),
    };
    const contracts = {
      detail: vi.fn().mockResolvedValue(detail),
      find: vi.fn().mockResolvedValue(head),
    };
    const terms = {
      find: vi.fn().mockResolvedValue({
        contractId: source.contract.id,
        version: 2,
        waterUnitPrice: "3.0000",
        electricityUnitPrice: "4.0000",
        fixedFees: [{ id: "fee-1", name: "物业费", monthlyAmountMinor: 5000 }],
      }),
    };
    const readings = {
      list: vi.fn().mockResolvedValue([
        {
          id: "reading-1",
          organizationId: source.organizationId,
          contractId: source.contract.id,
          spaceId: source.contract.spaces[0]?.spaceId,
          kind: "water",
          readingDate: "2026-08-01",
          reading: "120.0000",
          revision: 1,
          predecessorId: null,
        },
      ]),
    };
    const cash = { allForContract: vi.fn().mockResolvedValue([]) };
    const settlements = { findCurrent: vi.fn().mockResolvedValue(null) };
    const service = new RentalFinanceSourceService(
      contracts as never,
      bills as never,
      terms as never,
      readings as never,
      cash as never,
      settlements as never,
    );

    try {
      const snapshot = await service.read(
        { organizationId: source.organizationId, contractId: source.contract.id },
        tx as never,
      );

      expect(snapshot.context).toEqual({
        organizationId: source.organizationId,
        contractId: source.contract.id,
        today: "2026-08-31",
        currencyCode: "CNY",
        timezone: "Asia/Shanghai",
      });
      expect(snapshot.contract.billingMode).toBe("monthly_settlement");
      expect(snapshot.terms).toMatchObject({ version: "2", waterUnitPrice: "3.0000" });
      expect(snapshot.readings[0]).toMatchObject({ contractId: source.contract.id, revision: 1 });
      expect(snapshot.bills).toEqual([historicalBill]);
      expect(snapshot.cancelledOn).toBe("2026-08-31");
      expect(contracts.detail).toHaveBeenCalledWith(
        source.organizationId,
        source.contract.id,
        "2026-08-31",
        tx,
      );
      expect(contracts.find).toHaveBeenCalledWith(source.organizationId, source.contract.id, tx);
      expect(bills.allForContract).toHaveBeenCalledWith(
        source.organizationId,
        source.contract.id,
        tx,
      );
      expect(bills.activeForContract).not.toHaveBeenCalled();
      expect(terms.find).toHaveBeenCalledWith(
        { organizationId: source.organizationId, contractId: source.contract.id },
        tx,
      );
      expect(readings.list).toHaveBeenCalledWith(
        { organizationId: source.organizationId, contractId: source.contract.id },
        tx,
      );
      expect(cash.allForContract).toHaveBeenCalledWith(
        { organizationId: source.organizationId, contractId: source.contract.id },
        tx,
      );
      expect(settlements.findCurrent).toHaveBeenCalledWith(
        { organizationId: source.organizationId, contractId: source.contract.id },
        tx,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps an old contract without a persisted mode to legacy_receivable", async () => {
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ baseCurrency: "CNY", timezone: "Asia/Shanghai" }]),
    };
    const tx = { select: vi.fn().mockReturnValue(query) };
    const source = rentalBillingSource();
    const detail = {
      ...source.contract,
      createdAt: new Date(source.contract.createdAt),
      updatedAt: new Date(source.contract.updatedAt),
    };
    const contracts = {
      detail: vi.fn().mockResolvedValue(detail),
      find: vi.fn().mockResolvedValue({
        id: source.contract.id,
        organizationId: source.organizationId,
        propertyId: source.contract.propertyId,
        cancelledAt: null,
      }),
    };
    const service = new RentalFinanceSourceService(
      contracts as never,
      { allForContract: vi.fn().mockResolvedValue([]) } as never,
      { find: vi.fn().mockResolvedValue(null) } as never,
      { list: vi.fn().mockResolvedValue([]) } as never,
      { allForContract: vi.fn().mockResolvedValue([]) } as never,
      { findCurrent: vi.fn().mockResolvedValue(null) } as never,
    );

    const snapshot = await service.read(
      { organizationId: source.organizationId, contractId: source.contract.id },
      tx as never,
    );

    expect(snapshot.contract.billingMode).toBe("legacy_receivable");
    expect(snapshot.cancelledOn).toBeNull();
  });

  it("derives the contract-wide settlement balance from every valid cash entry", async () => {
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ baseCurrency: "CNY", timezone: "Asia/Shanghai" }]),
    };
    const tx = { select: vi.fn().mockReturnValue(query) };
    const source = rentalBillingSource();
    const detail = {
      ...source.contract,
      createdAt: new Date(source.contract.createdAt),
      updatedAt: new Date(source.contract.updatedAt),
    };
    const settlement = {
      id: "settlement-1",
      contractId: source.contract.id,
      eventId: "event-1",
      kind: "termination",
      effectiveEndDate: "2026-08-31",
      version: "settlement-version-3",
      revision: 3,
      finalCostMinor: 1500,
      status: "pending_collection",
      confirmedAt: new Date("2026-09-01T00:00:00.000Z"),
      confirmedByUserId: "user-1",
    };
    const cashRecords = [
      {
        id: "cash-bill-receipt",
        contractId: source.contract.id,
        billId: "bill-1",
        settlementId: null,
        kind: "receipt",
        purpose: "bill_receipt",
        amountMinor: 1000,
        occurredOn: "2026-08-20",
        note: null,
        createdAt: new Date("2026-08-20T00:00:00.000Z"),
        createdByUserId: "user-1",
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      },
      {
        id: "cash-deposit-receipt",
        contractId: source.contract.id,
        billId: "deposit-1",
        settlementId: null,
        kind: "receipt",
        purpose: "deposit_receipt",
        amountMinor: 300,
        occurredOn: "2026-08-21",
        note: null,
        createdAt: new Date("2026-08-21T00:00:00.000Z"),
        createdByUserId: "user-1",
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      },
      {
        id: "cash-refund",
        contractId: source.contract.id,
        billId: null,
        settlementId: "settlement-1",
        kind: "refund",
        purpose: "refund",
        amountMinor: 100,
        occurredOn: "2026-08-22",
        note: null,
        createdAt: new Date("2026-08-22T00:00:00.000Z"),
        createdByUserId: "user-1",
        revokedAt: null,
        revokedByUserId: null,
        revokeReason: null,
      },
    ];
    const service = new RentalFinanceSourceService(
      {
        detail: vi.fn().mockResolvedValue(detail),
        find: vi.fn().mockResolvedValue({
          id: source.contract.id,
          organizationId: source.organizationId,
          propertyId: source.contract.propertyId,
          cancelledAt: null,
        }),
      } as never,
      { allForContract: vi.fn().mockResolvedValue([]) } as never,
      { find: vi.fn().mockResolvedValue(null) } as never,
      { list: vi.fn().mockResolvedValue([]) } as never,
      { allForContract: vi.fn().mockResolvedValue(cashRecords) } as never,
      { findCurrent: vi.fn().mockResolvedValue(settlement) } as never,
    );

    const snapshot = await service.read(
      { organizationId: source.organizationId, contractId: source.contract.id },
      tx as never,
    );

    expect(snapshot.settlement).toMatchObject({
      id: "settlement-1",
      version: "settlement-version-3",
      balance: {
        version: "settlement-version-3",
        receivedMinor: 1300,
        refundedMinor: 100,
        netReceivedMinor: 1200,
        outstandingMinor: 300,
        refundableMinor: 0,
        state: "partial",
        overdue: false,
      },
    });
  });
});
