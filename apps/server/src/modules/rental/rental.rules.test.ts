import { describe, expect, it } from "vitest";

import {
  assertCustomTypeName,
  calculateEffectiveActive,
  findBatchConflicts,
  mergePropertyUpdate,
  mergeSpaceUpdate,
} from "./rental.rules.js";

describe("rental rules", () => {
  it("requires custom names only for the other type", () => {
    expect(() => assertCustomTypeName("other", undefined)).toThrow();
    expect(() => assertCustomTypeName("other", "  ")).toThrow();
    expect(() => assertCustomTypeName("shop", "商铺自定义")).toThrow();
    expect(() => assertCustomTypeName("shop", null)).not.toThrow();
    expect(() => assertCustomTypeName("other", "  联排住宅  ")).not.toThrow();
  });

  it("merges property updates and validates the resulting type", () => {
    const current = {
      name: "仓库",
      type: "warehouse" as const,
      customTypeName: null,
      countryCode: "CN",
      province: null,
      city: null,
      district: null,
      addressLine: "工业路 1 号",
      note: null,
    };

    expect(mergePropertyUpdate(current, { name: "新仓库" })).toEqual({
      ...current,
      name: "新仓库",
    });
    expect(mergePropertyUpdate(current, { type: "other", customTypeName: "厂房" })).toMatchObject({
      type: "other",
      customTypeName: "厂房",
    });
    expect(() => mergePropertyUpdate(current, { type: "other" })).toThrow();
  });

  it("merges space updates and validates the resulting type", () => {
    const current = {
      name: "101",
      code: "A",
      type: "room" as const,
      customTypeName: null,
      isRentable: true,
      isActive: true,
      sortOrder: 0,
    };

    expect(mergeSpaceUpdate(current, { code: null })).toEqual({ ...current, code: null });
    expect(() => mergeSpaceUpdate(current, { type: "other" })).toThrow();
    expect(mergeSpaceUpdate(current, { type: "other", customTypeName: "套间" })).toMatchObject({
      type: "other",
      customTypeName: "套间",
    });
  });

  it("finds trimmed duplicate names and non-empty codes", () => {
    expect(
      findBatchConflicts([
        { name: "101", code: "A" },
        { name: " 101 ", code: "B" },
        { name: "102", code: " A " },
      ]),
    ).toEqual([
      { field: "name", indexes: [0, 1], value: "101" },
      { field: "code", indexes: [0, 2], value: "A" },
    ]);
    expect(findBatchConflicts([{ name: "101", code: "  " }, { name: "102" }])).toEqual([]);
  });

  it("calculates effective activity from property, self and all ancestors", () => {
    expect(calculateEffectiveActive(true, true, [])).toBe(true);
    expect(calculateEffectiveActive(true, true, [true, true])).toBe(true);
    expect(calculateEffectiveActive(false, true, [true])).toBe(false);
    expect(calculateEffectiveActive(true, false, [true])).toBe(false);
    expect(calculateEffectiveActive(true, true, [true, false])).toBe(false);
  });
});
