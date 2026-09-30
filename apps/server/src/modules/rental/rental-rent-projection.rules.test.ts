import { describe, expect, it } from "vitest";
import type { BillingTerms } from "./billing.types.js";
import { projectRentalRentThroughDate } from "./rental-rent-projection.rules.js";

const terms: BillingTerms = {
  startDate: "2026-09-15",
  endDate: "2026-12-31",
  rentAmountMinor: 300_000,
  billingAnchor: "calendar_month",
  paymentIntervalMonths: 1,
  dueDaysBefore: 0,
};

describe("projectRentalRentThroughDate", () => {
  it("projects original payment-period rent through the inclusive effective end date", () => {
    const projection = projectRentalRentThroughDate(terms, "2026-10-20");

    expect(
      projection.map(({ billingMonth, lines }) => [
        billingMonth,
        lines.map(({ periodStart, periodEnd, amountMinor }) => [
          periodStart,
          periodEnd,
          amountMinor,
        ]),
      ]),
    ).toEqual([
      ["2026-09", [["2026-09-15", "2026-09-30", 160_000]]],
      ["2026-10", [["2026-10-01", "2026-10-20", 193_548]]],
    ]);
  });
});
