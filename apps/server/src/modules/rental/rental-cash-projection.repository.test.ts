import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import {
  rentalBills,
  rentalCashEntries,
  rentalContracts,
  rentalMeterReadings,
  rentalSettlementBills,
  rentalSettlements,
} from "../../db/schema.js";
import { RentalCashProjectionRepository } from "./rental-cash-projection.repository.js";

const dialect = new PgDialect();

describe("RentalCashProjectionRepository", () => {
  it("reads full contract finance facts in a fixed scoped batch and retains revoked/void history", async () => {
    const org = "org-1";
    const contractIds = ["contract-1", "contract-2"];
    const facts = new Map<unknown, unknown[]>([
      [
        rentalContracts,
        [
          {
            organizationId: org,
            contractId: contractIds[0],
            billingMode: "monthly_settlement",
            lifecycleStatus: "terminated",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            rentAmountMinor: 300_000,
            billingAnchor: "contract_start",
            paymentIntervalMonths: 1,
            dueDaysBefore: 5,
            terminationDate: "2026-09-30",
            cancelledAt: null,
          },
          {
            organizationId: org,
            contractId: contractIds[1],
            billingMode: "monthly_settlement",
            lifecycleStatus: "confirmed",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            rentAmountMinor: 200_000,
            billingAnchor: "contract_start",
            paymentIntervalMonths: 1,
            dueDaysBefore: 5,
            terminationDate: null,
            cancelledAt: null,
          },
        ],
      ],
      [
        rentalBills,
        [
          {
            organizationId: org,
            contractId: contractIds[0],
            id: "void-bill",
            type: "monthly",
            status: "voided",
            modelVersion: 2,
            billingMonth: "2026-08",
            revision: 3,
            amountMinor: 300_000,
            sourceKey: "monthly:2026-08",
          },
          {
            organizationId: org,
            contractId: contractIds[1],
            id: "deposit-bill",
            type: "deposit",
            status: "active",
            modelVersion: 2,
            billingMonth: null,
            revision: 1,
            amountMinor: 200_000,
            sourceKey: "deposit:0",
          },
        ],
      ],
      [
        rentalCashEntries,
        [
          {
            organizationId: org,
            contractId: contractIds[0],
            id: "revoked-receipt",
            billId: "void-bill",
            settlementId: null,
            kind: "receipt",
            purpose: "bill_receipt",
            amountMinor: 100_000,
            occurredOn: "2026-08-31",
            revokedAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
      ],
      [
        rentalSettlements,
        [
          {
            organizationId: org,
            contractId: contractIds[0],
            id: "settlement-1",
            eventId: "event-1",
            kind: "termination",
            effectiveEndDate: "2026-09-30",
            version: "projection-version",
            revision: 2,
            finalCostMinor: 290_000,
            status: "pending_collection",
          },
        ],
      ],
      [
        rentalSettlementBills,
        [
          {
            organizationId: org,
            contractId: contractIds[0],
            settlementId: "settlement-1",
            billId: "void-bill",
          },
        ],
      ],
      [
        rentalMeterReadings,
        [
          {
            organizationId: org,
            contractId: contractIds[0],
            id: "reading-1",
            kind: "water",
            readingDate: "2026-08-31",
            reading: "12.5000",
            revision: 2,
            predecessorId: "reading-0",
          },
        ],
      ],
    ]);
    const whereClauses: Array<{ table: unknown; condition: unknown }> = [];
    const executor = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((condition: unknown) => {
            whereClauses.push({ table, condition });
            const rows = facts.get(table) ?? [];
            if (table === rentalContracts || table === rentalSettlements)
              return Promise.resolve(rows);
            return { orderBy: vi.fn(() => Promise.resolve(rows)) };
          }),
        })),
      })),
    };

    const records = await new RentalCashProjectionRepository().readMany(
      org,
      contractIds,
      executor as never,
    );

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      organizationId: org,
      contractId: contractIds[0],
      contract: { billingMode: "monthly_settlement", lifecycleStatus: "terminated" },
      bills: [{ id: "void-bill", status: "voided", revision: 3 }],
      cashEntries: [{ id: "revoked-receipt", amountMinor: 100_000, revokedAt: expect.any(Date) }],
      settlement: { id: "settlement-1", eventId: "event-1", revision: 2 },
      settlementBillIds: ["void-bill"],
      readings: [{ id: "reading-1", revision: 2, reading: "12.5000" }],
    });
    expect(records[1]).toMatchObject({
      contractId: contractIds[1],
      bills: [{ id: "deposit-bill" }],
    });
    expect(executor.select).toHaveBeenCalledTimes(6);
    expect(whereClauses).toHaveLength(6);
    for (const { condition } of whereClauses) {
      const parameters = dialect.sqlToQuery(condition as never).params;
      expect(parameters).toEqual(expect.arrayContaining([org, ...contractIds]));
    }
  });

  it("returns no rows without querying when the distinct contract scope is empty", async () => {
    const executor = { select: vi.fn() };
    await expect(
      new RentalCashProjectionRepository().readMany("org-1", [], executor as never),
    ).resolves.toEqual([]);
    expect(executor.select).not.toHaveBeenCalled();
  });
});
