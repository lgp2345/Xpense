import { describe, expect, it } from "vitest";

import {
  assertContractAggregate,
  assertPartyPeriods,
  assertSpaceAllocations,
  finalDepositAmount,
  prorateCalendarMonthRent,
} from "./contract.rules.js";

const tenantA = "123e4567-e89b-12d3-a456-426614174000";
const tenantB = "223e4567-e89b-12d3-a456-426614174000";
const spaceA = "323e4567-e89b-12d3-a456-426614174000";
const spaceB = "423e4567-e89b-12d3-a456-426614174000";

describe("contract rent and aggregate rules", () => {
  it("prorates calendar-month rent inclusively using integer rounding", () => {
    expect(prorateCalendarMonthRent(310_000, "2026-03-20", "2026-03-31")).toBe(120_000);
    expect(prorateCalendarMonthRent(290_000, "2024-02-01", "2024-02-29")).toBe(290_000);
    expect(prorateCalendarMonthRent(100, "2026-04-01", "2026-04-01")).toBe(3);
    expect(() => prorateCalendarMonthRent(100, "2026-03-31", "2026-04-01")).toThrow();
    expect(() =>
      prorateCalendarMonthRent(Number.MAX_SAFE_INTEGER, "2026-01-01", "2026-01-31"),
    ).not.toThrow();
    expect(() =>
      prorateCalendarMonthRent(Number.MAX_SAFE_INTEGER + 1, "2026-01-01", "2026-01-31"),
    ).toThrow();
  });

  it("requires space allocations to be absent together or positive and sum to rent", () => {
    expect(() =>
      assertSpaceAllocations([{ spaceId: spaceA }, { spaceId: spaceB }], 300_000),
    ).not.toThrow();
    expect(() =>
      assertSpaceAllocations(
        [
          { spaceId: spaceA, rentAllocationMinor: 100_000 },
          { spaceId: spaceB, rentAllocationMinor: 200_000 },
        ],
        300_000,
      ),
    ).not.toThrow();
    expect(() =>
      assertSpaceAllocations(
        [{ spaceId: spaceA, rentAllocationMinor: 100_000 }, { spaceId: spaceB }],
        300_000,
      ),
    ).toThrow();
    expect(() =>
      assertSpaceAllocations(
        [
          { spaceId: spaceA, rentAllocationMinor: 100_000 },
          { spaceId: spaceB, rentAllocationMinor: 100_000 },
        ],
        300_000,
      ),
    ).toThrow();
    expect(() =>
      assertSpaceAllocations([{ spaceId: spaceA }, { spaceId: spaceA }], 300_000),
    ).toThrow();
  });

  it("validates party periods against contract bounds without overlapping a tenant", () => {
    expect(() =>
      assertPartyPeriods(
        [
          {
            tenantId: tenantA,
            validFrom: "2026-01-01",
            validTo: "2026-06-30",
            isPrimaryPayer: true,
          },
          {
            tenantId: tenantA,
            validFrom: "2026-07-01",
            validTo: "2026-12-31",
            isPrimaryPayer: true,
          },
          {
            tenantId: tenantB,
            validFrom: "2026-01-01",
            validTo: "2026-12-31",
            isPrimaryPayer: false,
          },
        ],
        "2026-01-01",
        "2026-12-31",
      ),
    ).not.toThrow();
    expect(() =>
      assertPartyPeriods(
        [
          {
            tenantId: tenantA,
            validFrom: "2026-01-01",
            validTo: "2026-06-30",
            isPrimaryPayer: true,
          },
          {
            tenantId: tenantA,
            validFrom: "2026-06-30",
            validTo: "2026-12-31",
            isPrimaryPayer: true,
          },
        ],
        "2026-01-01",
        "2026-12-31",
      ),
    ).toThrow();
    expect(() =>
      assertPartyPeriods(
        [
          {
            tenantId: tenantA,
            validFrom: "2025-12-31",
            validTo: "2026-12-31",
            isPrimaryPayer: true,
          },
        ],
        "2026-01-01",
        "2026-12-31",
      ),
    ).toThrow();
  });

  it("requires exactly one primary payer throughout all historical party periods", () => {
    expect(() =>
      assertPartyPeriods(
        [
          {
            tenantId: tenantA,
            validFrom: "2026-01-01",
            validTo: "2026-06-29",
            isPrimaryPayer: true,
          },
          {
            tenantId: tenantB,
            validFrom: "2026-07-01",
            validTo: "2026-12-31",
            isPrimaryPayer: true,
          },
        ],
        "2026-01-01",
        "2026-12-31",
      ),
    ).toThrow();
    expect(() =>
      assertPartyPeriods(
        [
          {
            tenantId: tenantA,
            validFrom: "2026-01-01",
            validTo: "2026-12-31",
            isPrimaryPayer: true,
          },
          {
            tenantId: tenantB,
            validFrom: "2026-06-01",
            validTo: "2026-06-30",
            isPrimaryPayer: true,
          },
        ],
        "2026-01-01",
        "2026-12-31",
      ),
    ).toThrow();
  });

  it("computes mutually exclusive fixed and rent-multiple deposits safely", () => {
    expect(
      finalDepositAmount({ calculationMode: "fixed_amount", fixedAmountMinor: 50_000 }, 300_000),
    ).toBe(50_000);
    expect(
      finalDepositAmount({ calculationMode: "rent_multiple", rentMultiple: "1.5000" }, 3_333),
    ).toBe(5_000);
    expect(() =>
      finalDepositAmount(
        { calculationMode: "fixed_amount", fixedAmountMinor: 50_000, rentMultiple: "1" },
        300_000,
      ),
    ).toThrow();
    expect(() =>
      finalDepositAmount({ calculationMode: "rent_multiple", rentMultiple: "0" }, 300_000),
    ).toThrow();
    expect(() =>
      finalDepositAmount(
        { calculationMode: "rent_multiple", rentMultiple: "2" },
        Number.MAX_SAFE_INTEGER,
      ),
    ).toThrow();
  });

  it("requires a confirmed aggregate to have complete terms and exactly one primary payer", () => {
    const aggregate = {
      status: "confirmed" as const,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      rentAmountMinor: 300_000,
      billingAnchor: "calendar_month" as const,
      paymentIntervalMonths: 1 as const,
      dueDaysBefore: 5,
      parties: [
        { tenantId: tenantA, isPrimaryPayer: true },
        { tenantId: tenantB, isPrimaryPayer: false },
      ],
      spaces: [{ spaceId: spaceA }],
      depositTerms: [],
    };

    expect(() => assertContractAggregate(aggregate)).not.toThrow();
    expect(() =>
      assertContractAggregate({
        ...aggregate,
        parties: aggregate.parties.map((party) => ({ ...party, isPrimaryPayer: false })),
      }),
    ).toThrow();
    expect(() => assertContractAggregate({ ...aggregate, paymentIntervalMonths: 2 })).toThrow();
    expect(() => assertContractAggregate({ ...aggregate, dueDaysBefore: 91 })).toThrow();
    expect(() => assertContractAggregate({ ...aggregate, endDate: "2025-12-31" })).toThrow();
    expect(() =>
      assertContractAggregate({
        ...aggregate,
        status: "terminated",
        terminationDate: "2026-01-01",
      }),
    ).not.toThrow();
    expect(() =>
      assertContractAggregate({
        ...aggregate,
        status: "terminated",
        terminationDate: null,
      }),
    ).toThrow();
    for (const status of ["confirmed", "draft", "cancelled"] as const) {
      expect(() =>
        assertContractAggregate({
          ...aggregate,
          status,
          terminationDate: "2026-06-30",
        }),
      ).toThrow();
    }
    expect(() =>
      assertContractAggregate({
        ...aggregate,
        status: "terminated",
        terminationDate: "2025-12-31",
      }),
    ).toThrow();
    expect(() =>
      assertContractAggregate({
        ...aggregate,
        status: "terminated",
        terminationDate: "2026-12-31",
      }),
    ).toThrow();
  });

  it("validates standalone draft dates and deposit structures without rent", () => {
    const draft = {
      status: "draft" as const,
      startDate: null,
      endDate: null,
      rentAmountMinor: null,
      billingAnchor: null,
      paymentIntervalMonths: null,
      dueDaysBefore: null,
      parties: [],
      spaces: [],
      depositTerms: [],
    };

    expect(() => assertContractAggregate({ ...draft, startDate: "0000-01-01" })).toThrow();
    expect(() => assertContractAggregate({ ...draft, endDate: "2026-02-29" })).toThrow();
    expect(() =>
      assertContractAggregate({
        ...draft,
        depositTerms: [
          {
            type: "rental" as const,
            calculationMode: "fixed_amount" as const,
            fixedAmountMinor: 100,
            rentMultiple: "1",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      assertContractAggregate({
        ...draft,
        depositTerms: [
          {
            type: "rental" as const,
            calculationMode: "fixed_amount" as const,
            fixedAmountMinor: -1,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      assertContractAggregate({
        ...draft,
        depositTerms: [
          {
            type: "rental" as const,
            calculationMode: "rent_multiple" as const,
            rentMultiple: "0",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      assertContractAggregate({
        ...draft,
        depositTerms: [
          {
            type: "other" as const,
            calculationMode: "fixed_amount" as const,
            fixedAmountMinor: 100,
          },
        ],
      }),
    ).toThrow();
  });
});
