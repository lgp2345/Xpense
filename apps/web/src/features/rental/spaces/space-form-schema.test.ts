import { describe, expect, it } from "vitest";

import {
  spaceFormDefaults,
  spaceFormSchema,
  toCreateSpaceRequest,
  toUpdateSpaceRequest,
} from "./space-form-schema";

describe("spaceFormSchema", () => {
  it("requires a custom name only for the custom space type", () => {
    expect(
      spaceFormSchema.safeParse({
        name: "储物间",
        code: "",
        type: "other",
        customTypeName: "",
        isRentable: false,
        sortOrder: 0,
        note: "",
      }).success,
    ).toBe(false);
    expect(
      spaceFormSchema.safeParse({
        name: "储物间",
        code: "",
        type: "other",
        customTypeName: "储物间",
        isRentable: false,
        sortOrder: 0,
        note: "",
      }).success,
    ).toBe(true);
  });

  it("normalizes creation values without first-stage rent or area fields", () => {
    expect(
      toCreateSpaceRequest("property-a", undefined, {
        name: " 101 ",
        code: " A-101 ",
        type: "room",
        customTypeName: "",
        isRentable: true,
        sortOrder: 2,
        note: "",
      }),
    ).toEqual({
      propertyId: "property-a",
      name: "101",
      code: "A-101",
      type: "room",
      isRentable: true,
      sortOrder: 2,
    });
  });

  it("creates a minimal update only when an editable value changes", () => {
    const initial = spaceFormDefaults({
      id: "space-a",
      propertyId: "property-a",
      parentId: null,
      name: "101",
      code: "A-101",
      type: "room",
      customTypeName: null,
      isRentable: true,
      note: null,
      isActive: true,
      isEffectivelyActive: true,
      sortOrder: 0,
      hasChildren: false,
    });
    expect(toUpdateSpaceRequest(initial, initial)).toBeNull();
    expect(toUpdateSpaceRequest(initial, { ...initial, name: "102" })).toEqual({ name: "102" });
  });
});
