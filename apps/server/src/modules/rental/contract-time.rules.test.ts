import { describe, expect, it } from "vitest";

import {
  actualContractEndTime,
  contractCalendarDay,
  normalizeContractTime,
  normalizeStoredContractTime,
  organizationDateTime,
} from "./contract-time.rules.js";

describe("contract time rules", () => {
  it("expands legacy dates to the requested contract boundary", () => {
    expect(normalizeContractTime("2026-10-05", "start")).toBe("2026-10-05T00:00:00");
    expect(normalizeContractTime("2026-11-04", "end")).toBe("2026-11-04T23:59:59");
  });

  it("preserves valid wall-clock seconds and rejects offsets or invalid times", () => {
    expect(normalizeContractTime("2026-10-05T08:09:10", "start")).toBe("2026-10-05T08:09:10");
    for (const value of [
      "2026-10-05T08:09:10Z",
      "2026-10-05T08:09:10+08:00",
      "2026-10-05T08:09:10.000",
      "2026-02-29",
      "2026-10-05T24:00:00",
      "2026-10-05T08:60:00",
    ]) {
      expect(() => normalizeContractTime(value, "start")).toThrow(RangeError);
    }
  });

  it("normalizes PostgreSQL local timestamp strings and preserves null", () => {
    expect(normalizeStoredContractTime("2026-10-05 08:09:10", "start")).toBe("2026-10-05T08:09:10");
    expect(normalizeStoredContractTime("2026-10-05", "end")).toBe("2026-10-05T23:59:59");
    expect(normalizeStoredContractTime(null, "start")).toBeNull();
  });

  it("extracts a validated contract calendar day from date or datetime input", () => {
    expect(contractCalendarDay("2026-10-05")).toBe("2026-10-05");
    expect(contractCalendarDay("2026-10-05T23:59:59")).toBe("2026-10-05");
    expect(() => contractCalendarDay("2026-10-05T24:00:00")).toThrow(RangeError);
  });

  it("formats organization wall-clock time including midnight as hour zero", () => {
    expect(organizationDateTime(new Date("2026-10-05T16:00:00.999Z"), "Asia/Shanghai")).toBe(
      "2026-10-06T00:00:00",
    );
    expect(organizationDateTime(new Date("2026-10-05T16:30:59.999Z"), "Asia/Shanghai")).toBe(
      "2026-10-06T00:30:59",
    );
  });

  it("uses the termination day or the full scheduled end boundary", () => {
    expect(actualContractEndTime("2026-11-04", null)).toBe("2026-11-04T23:59:59");
    expect(actualContractEndTime("2026-11-04T17:30:00", undefined)).toBe("2026-11-04T17:30:00");
    expect(actualContractEndTime("2026-11-04T17:30:00", "2026-10-20")).toBe("2026-10-20T23:59:59");
    expect(() => actualContractEndTime("2026-11-04T17:30:00", "2026-10-20T00:00:00")).toThrow(
      RangeError,
    );
  });
});
