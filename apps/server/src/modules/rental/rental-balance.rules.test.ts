import { describe, expect, it } from "vitest";
import { calculateRentalBalance } from "./rental-balance.rules.js";

describe("calculateRentalBalance", () => {
  it("derives an overdue partial balance from actual receipts and refunds", () => {
    expect(calculateRentalBalance(300_000, 200_000, 0, "2026-10-01", "2026-10-02")).toEqual({
      receivedMinor: 200_000,
      refundedMinor: 0,
      netReceivedMinor: 200_000,
      outstandingMinor: 100_000,
      refundableMinor: 0,
      state: "partial",
      overdue: true,
    });
  });

  it("keeps prior refunds in the net and reports the remaining refundable amount", () => {
    expect(calculateRentalBalance(200_000, 300_000, 50_000, null, "2026-10-20")).toMatchObject({
      netReceivedMinor: 250_000,
      outstandingMinor: 0,
      refundableMinor: 50_000,
      state: "refundable",
      overdue: false,
    });
  });

  it("treats a zero balance as settled and a fully covered amount as not overdue", () => {
    expect(calculateRentalBalance(0, 0, 0, null, "2026-10-20")).toMatchObject({
      state: "settled",
      overdue: false,
    });
    expect(calculateRentalBalance(100, 100, 0, "2026-10-01", "2026-10-20")).toMatchObject({
      state: "settled",
      overdue: false,
    });
  });

  it("rejects negative inputs and any derived amount outside the safe integer range", () => {
    expect(() => calculateRentalBalance(-1, 0, 0, null, "2026-10-20")).toThrow(RangeError);
    expect(() => calculateRentalBalance(1, 0, -1, null, "2026-10-20")).toThrow(RangeError);
    expect(() =>
      calculateRentalBalance(
        Number.MAX_SAFE_INTEGER,
        0,
        Number.MAX_SAFE_INTEGER,
        null,
        "2026-10-20",
      ),
    ).toThrow(RangeError);
  });
});
