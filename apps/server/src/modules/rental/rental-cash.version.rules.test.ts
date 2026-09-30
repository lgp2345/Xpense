import { describe, expect, it } from "vitest";

import type { RentalCashVersionFacts } from "./rental-cash.version.rules.js";
import { rentalCashSourceVersion } from "./rental-cash.version.rules.js";

const billTarget = { kind: "bill", billId: "00000000-0000-4000-8000-000000000030" } as const;
const otherBillId = "00000000-0000-4000-8000-000000000032";
const settlementTarget = {
  kind: "settlement",
  settlementId: "00000000-0000-4000-8000-000000000031",
} as const;

describe("rentalCashSourceVersion", () => {
  it("changes when persisted cash or bill facts change and identifies the exact target", () => {
    const source = {
      organizationId: "org",
      contractId: "contract",
      contract: {
        billingMode: "monthly_settlement",
        lifecycleStatus: "confirmed",
        terminationDate: null,
      },
      bills: [
        {
          id: billTarget.billId,
          type: "monthly",
          amountMinor: 300_000,
          status: "active",
          modelVersion: 2,
          revision: 1,
          sourceKey: "monthly:2026-08",
        },
        {
          id: otherBillId,
          type: "monthly",
          amountMinor: 75_000,
          status: "active",
          modelVersion: 2,
          revision: 1,
          sourceKey: "monthly:2026-07",
        },
      ],
      cashEntries: [],
      settlement: null,
      settlementBillIds: [],
      readings: [],
    } as RentalCashVersionFacts;

    const initial = rentalCashSourceVersion(source, billTarget);
    expect(rentalCashSourceVersion(source, settlementTarget)).not.toBe(initial);
    expect(
      rentalCashSourceVersion(
        { ...source, cashEntries: [{ id: "cash-1", amountMinor: 100_000 }] as never },
        billTarget,
      ),
    ).not.toBe(initial);
    expect(
      rentalCashSourceVersion(
        {
          ...source,
          bills: [
            { ...(source.bills[0] ?? fail("Version bill fixture missing")), amountMinor: 300_001 },
          ],
        },
        billTarget,
      ),
    ).not.toBe(initial);
    expect(
      rentalCashSourceVersion(
        {
          ...source,
          bills: source.bills.map((bill) =>
            bill.id === otherBillId ? { ...bill, revision: 2 } : bill,
          ),
        },
        billTarget,
      ),
    ).not.toBe(initial);
    expect(
      rentalCashSourceVersion(
        {
          ...source,
          cashEntries: [
            {
              id: "cash-on-other-bill",
              target: { kind: "bill", billId: otherBillId },
              kind: "receipt",
              purpose: "bill_receipt",
              amountMinor: 10_000,
              occurredOn: "2026-09-20",
              revokedAt: null,
            },
          ],
        },
        billTarget,
      ),
    ).not.toBe(initial);
  });

  it("ignores derived balances and versions so a refreshed settlement can round-trip", () => {
    const source = {
      organizationId: "org",
      contractId: "contract",
      contract: {
        billingMode: "monthly_settlement",
        lifecycleStatus: "confirmed",
        terminationDate: null,
      },
      bills: [
        {
          id: billTarget.billId,
          type: "monthly",
          amountMinor: 300_000,
          status: "active",
          modelVersion: 2,
          revision: 1,
          sourceKey: "monthly:2026-08",
          financial: { receivedMinor: 0, version: "derived-bill-v1" },
        },
      ],
      cashEntries: [],
      settlement: {
        id: settlementTarget.settlementId,
        eventId: "event-1",
        kind: "termination",
        effectiveEndDate: "2026-08-31",
        revision: 1,
        finalCostMinor: 300_000,
        status: "pending_collection",
        version: "persisted-settlement-v1",
        balance: { receivedMinor: 0, version: "derived-settlement-v1" },
      },
      settlementBillIds: [billTarget.billId],
      readings: [],
    } as RentalCashVersionFacts & {
      bills: Array<
        RentalCashVersionFacts["bills"][number] & {
          financial: { receivedMinor: number; version: string };
        }
      >;
      settlement: NonNullable<RentalCashVersionFacts["settlement"]> & {
        version: string;
        balance: { receivedMinor: number; version: string };
      };
    };

    const initial = rentalCashSourceVersion(source, settlementTarget);
    const sourceBill = source.bills[0] ?? fail("Version bill fixture missing");
    const refreshed = {
      ...source,
      bills: [{ ...sourceBill, financial: { receivedMinor: 100_000, version: "derived-bill-v2" } }],
      settlement: {
        ...source.settlement,
        version: "persisted-settlement-v2",
        balance: { receivedMinor: 100_000, version: "derived-settlement-v2" },
      },
    };

    expect(rentalCashSourceVersion(refreshed, settlementTarget)).toBe(initial);
  });
});

function fail(message: string): never {
  throw new Error(message);
}
