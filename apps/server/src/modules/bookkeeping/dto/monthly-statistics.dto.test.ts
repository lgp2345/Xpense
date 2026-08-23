import { describe, expect, it } from "vitest";

import { monthlyStatisticsSchema } from "./monthly-statistics.dto.js";

const ledgerId = "123e4567-e89b-12d3-a456-426614174000";

describe("monthly statistics DTO schema", () => {
  it("accepts a real four-digit calendar month and an optional ledger UUID", () => {
    expect(monthlyStatisticsSchema.parse({ month: "2026-02", ledgerId })).toEqual({
      month: "2026-02",
      ledgerId,
    });
    expect(monthlyStatisticsSchema.parse({ month: "9999-12" })).toEqual({ month: "9999-12" });
  });

  it.each([
    "0000-01",
    "2026-00",
    "2026-13",
    "2026-1",
    "26-01",
    "2026-01-01",
  ])("rejects the invalid calendar month %s", (month) => {
    expect(() => monthlyStatisticsSchema.parse({ month })).toThrow();
  });

  it("rejects invalid ledger IDs and forged query fields", () => {
    expect(() =>
      monthlyStatisticsSchema.parse({ month: "2026-08", ledgerId: "ledger-1" }),
    ).toThrow();
    expect(() =>
      monthlyStatisticsSchema.parse({ month: "2026-08", organizationId: ledgerId }),
    ).toThrow();
  });
});
