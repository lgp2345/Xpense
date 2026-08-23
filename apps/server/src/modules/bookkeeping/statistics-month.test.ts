import { describe, expect, it } from "vitest";

import { toCalendarMonthRange } from "./statistics-month.js";

describe("toCalendarMonthRange", () => {
  it.each([
    ["2024-02", { firstDay: "2024-02-01", lastDay: "2024-02-29" }],
    ["2100-02", { firstDay: "2100-02-01", lastDay: "2100-02-28" }],
    ["2026-04", { firstDay: "2026-04-01", lastDay: "2026-04-30" }],
    ["2026-12", { firstDay: "2026-12-01", lastDay: "2026-12-31" }],
  ])("derives the inclusive local calendar bounds for %s", (month, expected) => {
    expect(toCalendarMonthRange(month)).toEqual(expected);
  });

  it("rejects input outside the validated YYYY-MM contract", () => {
    expect(() => toCalendarMonthRange("2026-13")).toThrow("Invalid calendar month");
  });
});
