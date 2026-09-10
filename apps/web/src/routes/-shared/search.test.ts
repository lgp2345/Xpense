import { describe, expect, it } from "vitest";

import {
  readSearchDate,
  readSearchPage,
  readSearchString,
  readTrimmedSearchString,
} from "./search";

describe("URL search primitives", () => {
  it("reads non-empty strings and trims only when requested", () => {
    expect(readSearchString("  value  ")).toBe("  value  ");
    expect(readSearchString("")).toBeUndefined();
    expect(readTrimmedSearchString("  value  ")).toBe("value");
    expect(readTrimmedSearchString("   ")).toBeUndefined();
  });

  it("accepts only valid calendar dates", () => {
    expect(readSearchDate("2026-09-09")).toBe("2026-09-09");
    expect(readSearchDate("2026-02-30")).toBeUndefined();
    expect(readSearchDate("not-a-date")).toBeUndefined();
  });

  it("accepts positive integer pages from URL strings", () => {
    expect(readSearchPage("2")).toBe(2);
    expect(readSearchPage(3)).toBe(3);
    expect(readSearchPage("0")).toBeUndefined();
    expect(readSearchPage("1.5")).toBeUndefined();
  });
});
