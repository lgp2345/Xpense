import { describe, expect, it } from "vitest";

import { rentalPropertyTypes, rentalSpaceTypes } from "./rental.js";

describe("rental contracts", () => {
  it("keeps the phase-one vocabularies stable", () => {
    expect(rentalPropertyTypes).toEqual([
      "residential_unit",
      "detached_house",
      "apartment_building",
      "commercial_building",
      "complex",
      "shop",
      "office",
      "warehouse",
      "other",
    ]);
    expect(rentalSpaceTypes).toEqual([
      "building",
      "floor",
      "unit",
      "room",
      "shop",
      "office",
      "parking_space",
      "warehouse",
      "other",
    ]);
  });
});
