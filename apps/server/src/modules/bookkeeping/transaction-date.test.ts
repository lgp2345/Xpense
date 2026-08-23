import { describe, expect, it } from "vitest";

import { toOccurredOn } from "./transaction-date.js";

describe("toOccurredOn", () => {
  it("derives the calendar date in the organization timezone", () => {
    expect(toOccurredOn(new Date("2026-08-23T16:30:00.000Z"), "Asia/Shanghai")).toBe("2026-08-24");
  });

  it("handles a timezone whose local date is the previous UTC day", () => {
    expect(toOccurredOn(new Date("2026-08-23T01:00:00.000Z"), "America/Los_Angeles")).toBe(
      "2026-08-22",
    );
  });

  it("rejects an invalid Date and an invalid IANA timezone", () => {
    expect(() => toOccurredOn(new Date(Number.NaN), "Asia/Shanghai")).toThrow();
    expect(() => toOccurredOn(new Date(), "Not/A_Timezone")).toThrow();
  });
});
