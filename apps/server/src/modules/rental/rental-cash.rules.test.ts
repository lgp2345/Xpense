import { describe, expect, it } from "vitest";

import { calculateRentalCashBalance } from "./rental-cash.rules.js";

const billTarget = { kind: "bill", billId: "bill-1" } as const;
const settlementTarget = { kind: "settlement", settlementId: "settlement-1" } as const;

describe("calculateRentalCashBalance", () => {
  it("counts the remaining refund after earlier refunds and ignores revoked facts", () => {
    const result = calculateRentalCashBalance(
      [
        { target: billTarget, kind: "receipt", amountMinor: 300_000, revokedAt: null },
        { target: settlementTarget, kind: "refund", amountMinor: 100_000, revokedAt: null },
        {
          target: billTarget,
          kind: "refund",
          amountMinor: 25_000,
          revokedAt: "2026-09-30T00:00:00.000Z",
        },
        {
          target: { kind: "bill", billId: "other-bill" },
          kind: "receipt",
          amountMinor: 500_000,
          revokedAt: null,
        },
      ],
      settlementTarget,
      200_000,
      null,
      "2026-09-30",
    );

    expect(result).toMatchObject({
      receivedMinor: 800_000,
      refundedMinor: 100_000,
      netReceivedMinor: 700_000,
      refundableMinor: 500_000,
    });
  });

  it("bounds the aggregate before converting exact integer totals back to number", () => {
    expect(() =>
      calculateRentalCashBalance(
        [
          {
            target: billTarget,
            kind: "receipt",
            amountMinor: Number.MAX_SAFE_INTEGER,
            revokedAt: null,
          },
          { target: billTarget, kind: "receipt", amountMinor: 1, revokedAt: null },
        ],
        billTarget,
        1,
        null,
        "2026-09-30",
      ),
    ).toThrow(RangeError);
  });
});
