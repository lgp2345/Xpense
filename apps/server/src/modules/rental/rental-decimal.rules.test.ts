import { describe, expect, it } from "vitest";
import { calculateMeterCharge, parseDecimal4 } from "./rental-decimal.rules.js";

describe("parseDecimal4", () => {
  it("converts four-place decimal text to a scaled integer", () => {
    expect(parseDecimal4("12.3456")).toBe(123456n);
    expect(parseDecimal4("0")).toBe(0n);
    expect(parseDecimal4("9999999999999999.9999")).toBe(99999999999999999999n);
  });

  it.each([
    "",
    ".5",
    "1.",
    "1e2",
    "-1",
    "+1",
    "1.00001",
    "10000000000000000",
  ])("rejects unsupported decimal text %s", (value) => {
    expect(() => parseDecimal4(value)).toThrow(RangeError);
  });
});

describe("calculateMeterCharge", () => {
  it("calculates fractional usage and unit price in minor currency units", () => {
    expect(calculateMeterCharge("100", "112.5", "3")).toBe(3750);
  });

  it("rounds each meter charge half up and accepts zero usage", () => {
    expect(calculateMeterCharge("0", "0.01", "0.5")).toBe(1);
    expect(calculateMeterCharge("12.5", "12.5", "999")).toBe(0);
  });

  it("rejects decreasing readings and amounts outside the safe integer range", () => {
    expect(() => calculateMeterCharge("10", "9.9999", "2")).toThrow(RangeError);
    expect(() =>
      calculateMeterCharge("0", "9999999999999999.9999", "9999999999999999.9999"),
    ).toThrow(RangeError);
  });
});
