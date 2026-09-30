import { describe, expect, it } from "vitest";
import { calculateMonthlyCharges } from "./monthly-charge.rules.js";
import type { MonthlyChargeInput, RentalMeterReading } from "./rental-finance.types.js";

function reading(
  id: string,
  kind: "water" | "electricity",
  readingDate: string,
  value: string,
  predecessorId: string | null,
): RentalMeterReading {
  return {
    id,
    kind,
    readingDate,
    reading: value,
    spaceId: "space-1",
    contractId: "contract-1",
    revision: 1,
    predecessorId,
  };
}

function chargeInput(overrides: Partial<MonthlyChargeInput> = {}): MonthlyChargeInput {
  return {
    billingTerms: {
      startDate: "2026-10-01",
      endDate: "2026-12-31",
      rentAmountMinor: 300_000,
      billingAnchor: "calendar_month",
      paymentIntervalMonths: 1,
      dueDaysBefore: 0,
    },
    billingMonth: "2026-10",
    effectiveEndDate: null,
    chargeTerms: {
      contractId: "contract-1",
      version: "terms-v1",
      waterUnitPrice: "1",
      electricityUnitPrice: "0.5",
      fixedFees: [
        { id: "network", name: "网费", monthlyAmountMinor: 10_000 },
        { id: "cleaning", name: "卫生费", monthlyAmountMinor: 5_000 },
      ],
    },
    readings: {
      water: {
        previous: reading("w0", "water", "2026-09-30", "100", null),
        current: reading("w1", "water", "2026-10-31", "200", "w0"),
      },
      electricity: {
        previous: reading("e0", "electricity", "2026-09-30", "0", null),
        current: reading("e1", "electricity", "2026-10-31", "200", "e0"),
      },
    },
    extraFees: [{ id: "discount", name: "优惠", amountMinor: -10_000, note: "本期优惠" }],
    overrides: undefined,
    ...overrides,
  };
}

describe("calculateMonthlyCharges", () => {
  it("combines October rent, actual meter charges, fixed fees and a negative extra fee", () => {
    const result = calculateMonthlyCharges(chargeInput());

    expect(result.amountMinor).toBe(325_000);
    expect(result.lines.map(({ kind, amountMinor }) => [kind, amountMinor])).toEqual([
      ["rent_period", 300_000],
      ["water", 10_000],
      ["electricity", 10_000],
      ["fixed_fee", 10_000],
      ["fixed_fee", 5_000],
      ["extra_fee", -10_000],
    ]);
    expect(result.lines[1]?.feeSnapshot).toMatchObject({
      kind: "water",
      startReadingId: "w0",
      endReadingId: "w1",
      unitPrice: "1",
    });
  });

  it("places quarterly rent only in the month the payment period starts", () => {
    const quarterly = chargeInput({
      billingTerms: {
        ...chargeInput().billingTerms,
        billingAnchor: "contract_start",
        paymentIntervalMonths: 3,
      },
      extraFees: [],
      readings: { water: null, electricity: null },
    });

    const october = calculateMonthlyCharges({ ...quarterly, billingMonth: "2026-10" });
    const november = calculateMonthlyCharges({ ...quarterly, billingMonth: "2026-11" });

    expect(
      october.lines
        .filter((line) => line.kind === "rent_period")
        .reduce((sum, line) => sum + line.amountMinor, 0),
    ).toBe(900_000);
    expect(november.lines.some((line) => line.kind === "rent_period")).toBe(false);
    expect(november.amountMinor).toBe(15_000);
  });

  it("keeps the existing natural-month rent proration for a mid-month start", () => {
    const result = calculateMonthlyCharges(
      chargeInput({
        billingTerms: {
          startDate: "2026-09-15",
          endDate: "2026-12-31",
          rentAmountMinor: 300_000,
          billingAnchor: "calendar_month",
          paymentIntervalMonths: 1,
          dueDaysBefore: 0,
        },
        billingMonth: "2026-09",
        chargeTerms: { ...chargeInput().chargeTerms, fixedFees: [] },
        readings: { water: null, electricity: null },
        extraFees: [],
      }),
    );

    expect(result.lines.find((line) => line.kind === "rent_period")?.amountMinor).toBe(160_000);
  });

  it("includes the termination day when prorating fixed monthly charges", () => {
    const result = calculateMonthlyCharges(
      chargeInput({
        billingTerms: { ...chargeInput().billingTerms, rentAmountMinor: 200_000 },
        effectiveEndDate: "2026-10-20",
        readings: { water: null, electricity: null },
        extraFees: [],
        chargeTerms: {
          ...chargeInput().chargeTerms,
          fixedFees: [{ id: "network", name: "网费", monthlyAmountMinor: 10_000 }],
        },
      }),
    );

    expect(result.lines.find((line) => line.kind === "rent_period")?.amountMinor).toBe(129_032);
    expect(result.lines.find((line) => line.kind === "fixed_fee")?.amountMinor).toBe(6_452);
  });

  it("rounds each fixed fee separately and rejects a negative total", () => {
    const rounded = calculateMonthlyCharges(
      chargeInput({
        billingTerms: {
          startDate: "2027-02-01",
          endDate: "2027-02-14",
          rentAmountMinor: 1,
          billingAnchor: "calendar_month",
          paymentIntervalMonths: 1,
          dueDaysBefore: 0,
        },
        billingMonth: "2027-02",
        readings: { water: null, electricity: null },
        extraFees: [],
        chargeTerms: {
          ...chargeInput().chargeTerms,
          fixedFees: [
            { id: "a", name: "A", monthlyAmountMinor: 1 },
            { id: "b", name: "B", monthlyAmountMinor: 1 },
          ],
        },
      }),
    );
    expect(
      rounded.lines.filter((line) => line.kind === "fixed_fee").map((line) => line.amountMinor),
    ).toEqual([1, 1]);

    expect(() =>
      calculateMonthlyCharges(
        chargeInput({
          billingTerms: { ...chargeInput().billingTerms, rentAmountMinor: 1 },
          readings: { water: null, electricity: null },
          chargeTerms: { ...chargeInput().chargeTerms, fixedFees: [] },
          extraFees: [{ id: "fee", name: "减免", amountMinor: -2, note: "" }],
        }),
      ),
    ).toThrow(RangeError);

    expect(() =>
      calculateMonthlyCharges(
        chargeInput({
          readings: { water: null, electricity: null },
          chargeTerms: { ...chargeInput().chargeTerms, fixedFees: [] },
          extraFees: [
            { id: "overflow", name: "超大金额", amountMinor: Number.MAX_SAFE_INTEGER, note: "" },
          ],
        }),
      ),
    ).toThrow(RangeError);
  });
});
