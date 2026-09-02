import { describe, expect, it } from "vitest";

import {
  actualContractEnd,
  addCalendarDays,
  compareCalendarDates,
  dateRangesOverlap,
  deriveContractDisplayStatus,
  organizationDate,
} from "./contract-date.rules.js";

describe("contract calendar date rules", () => {
  it("converts an instant to the organization date without using the runtime timezone", () => {
    const now = new Date("2026-03-08T04:30:00.000Z");

    expect(organizationDate(now, "America/New_York")).toBe("2026-03-07");
    expect(organizationDate(now, "Asia/Shanghai")).toBe("2026-03-08");
    expect(() => organizationDate(new Date(Number.NaN), "Asia/Shanghai")).toThrow();
    expect(() => organizationDate(now, "Not/A_Timezone")).toThrow();
  });

  it("compares and adds Gregorian calendar dates across month and leap-year boundaries", () => {
    expect(compareCalendarDates("2026-09-30", "2026-09-30")).toBe(0);
    expect(compareCalendarDates("2026-09-29", "2026-09-30")).toBe(-1);
    expect(compareCalendarDates("2026-10-01", "2026-09-30")).toBe(1);
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("2024-02-28", 2)).toBe("2024-03-01");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(() => addCalendarDays("2026-02-29", 1)).toThrow();
    expect(() => addCalendarDays("2026-01-01", 0.5)).toThrow();
  });

  it("treats rental date ranges as inclusive", () => {
    expect(dateRangesOverlap("2026-09-01", "2026-09-30", "2026-09-30", "2026-10-30")).toBe(true);
    expect(dateRangesOverlap("2026-09-01", "2026-09-30", "2026-10-01", "2026-10-30")).toBe(false);
    expect(() =>
      dateRangesOverlap("2026-09-30", "2026-09-01", "2026-09-01", "2026-09-30"),
    ).toThrow();
  });

  it("uses the termination date as actualEnd without changing the nominal end date", () => {
    expect(actualContractEnd("2027-08-31", "2027-01-15")).toBe("2027-01-15");
    expect(actualContractEnd("2027-08-31", null)).toBe("2027-08-31");
  });

  it("derives lifecycle display status and preserves a future termination as active", () => {
    const futureTermination = {
      status: "terminated" as const,
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      terminationDate: "2026-10-15",
    };

    expect(deriveContractDisplayStatus(futureTermination, "2026-10-14")).toEqual({
      displayStatus: "expiring_soon",
      hasScheduledTermination: true,
    });
    expect(deriveContractDisplayStatus(futureTermination, "2026-10-15")).toEqual({
      displayStatus: "expiring_soon",
      hasScheduledTermination: true,
    });
    expect(deriveContractDisplayStatus(futureTermination, "2026-10-16")).toEqual({
      displayStatus: "terminated",
      hasScheduledTermination: false,
    });
    expect(
      deriveContractDisplayStatus(
        { status: "confirmed", startDate: "2026-10-01", endDate: "2027-09-30" },
        "2026-09-15",
      ),
    ).toEqual({ displayStatus: "upcoming", hasScheduledTermination: false });
    expect(
      deriveContractDisplayStatus(
        { status: "confirmed", startDate: "2026-01-01", endDate: "2026-10-15" },
        "2026-09-15",
      ),
    ).toEqual({ displayStatus: "expiring_soon", hasScheduledTermination: false });
    expect(
      deriveContractDisplayStatus(
        { status: "confirmed", startDate: "2026-01-01", endDate: "2026-09-14" },
        "2026-09-15",
      ),
    ).toEqual({ displayStatus: "expired", hasScheduledTermination: false });
    expect(
      deriveContractDisplayStatus(
        { status: "draft", startDate: null, endDate: null },
        "2026-09-15",
      ),
    ).toEqual({ displayStatus: "draft", hasScheduledTermination: false });
    expect(
      deriveContractDisplayStatus(
        { status: "cancelled", startDate: "2026-10-01", endDate: "2027-09-30" },
        "2026-09-15",
      ),
    ).toEqual({ displayStatus: "cancelled", hasScheduledTermination: false });
  });

  it("derives expiring status from the actual end of a future-terminated contract", () => {
    expect(
      deriveContractDisplayStatus(
        {
          status: "terminated",
          startDate: "2026-01-01",
          endDate: "2027-12-31",
          terminationDate: "2026-09-14",
        },
        "2026-08-20",
      ),
    ).toEqual({ displayStatus: "expiring_soon", hasScheduledTermination: true });
  });

  it("validates every supplied lifecycle date and termination boundaries", () => {
    expect(() =>
      deriveContractDisplayStatus(
        { status: "draft", startDate: "0000-01-01", endDate: null },
        "2026-09-15",
      ),
    ).toThrow();
    expect(() =>
      deriveContractDisplayStatus(
        { status: "cancelled", startDate: null, endDate: "2026-02-29" },
        "2026-09-15",
      ),
    ).toThrow();
    expect(() =>
      deriveContractDisplayStatus(
        {
          status: "terminated",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          terminationDate: "2025-12-31",
        },
        "2026-09-15",
      ),
    ).toThrow();
    expect(() =>
      deriveContractDisplayStatus(
        {
          status: "terminated",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          terminationDate: "2026-12-31",
        },
        "2026-09-15",
      ),
    ).toThrow();
    expect(() =>
      deriveContractDisplayStatus(
        {
          status: "terminated",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          terminationDate: "2026-01-01",
        },
        "2026-01-01",
      ),
    ).not.toThrow();
  });
});
