import { describe, expect, it } from "vitest";

import { createCategorySchema } from "./create-category.dto.js";
import { deleteCategorySchema } from "./delete-category.dto.js";
import { listCategoriesSchema } from "./list-categories.dto.js";
import { updateCategorySchema } from "./update-category.dto.js";

const ledgerId = "123e4567-e89b-12d3-a456-426614174000";
const categoryId = "223e4567-e89b-12d3-a456-426614174000";

describe("category DTO schemas", () => {
  it("requires a UUID ledger, accepts an optional category type, and rejects unknown query keys", () => {
    expect(listCategoriesSchema.parse({ ledgerId, type: "expense" })).toEqual({
      ledgerId,
      type: "expense",
    });
    expect(listCategoriesSchema.parse({ ledgerId })).toEqual({ ledgerId });
    expect(() => listCategoriesSchema.parse({ ledgerId: "invalid" })).toThrow();
    expect(() => listCategoriesSchema.parse({ ledgerId, type: "transfer" })).toThrow();
    expect(() => listCategoriesSchema.parse({ ledgerId, organizationId: ledgerId })).toThrow();
  });

  it("trims category names and icon identifiers while validating presentation fields", () => {
    expect(
      createCategorySchema.parse({
        ledgerId,
        type: "expense",
        parentId: categoryId,
        name: "  早餐  ",
        icon: "  utensils  ",
        color: "#12aBcF",
        sortOrder: 10,
      }),
    ).toEqual({
      ledgerId,
      type: "expense",
      parentId: categoryId,
      name: "早餐",
      icon: "utensils",
      color: "#12aBcF",
      sortOrder: 10,
    });
    expect(() =>
      createCategorySchema.parse({ ledgerId, type: "expense", name: "餐饮", unknown: true }),
    ).toThrow();
    expect(() =>
      createCategorySchema.parse({ ledgerId, type: "expense", name: "餐饮", sortOrder: 1.5 }),
    ).toThrow();
  });

  it("allows clearing parent/icon/color on update but requires at least one changed field", () => {
    expect(
      updateCategorySchema.parse({ id: categoryId, parentId: null, icon: null, color: null }),
    ).toEqual({ id: categoryId, parentId: null, icon: null, color: null });
    expect(() => updateCategorySchema.parse({ id: categoryId })).toThrow();
    expect(() => updateCategorySchema.parse({ id: categoryId, type: "transfer" })).toThrow();
    expect(() => updateCategorySchema.parse({ id: categoryId, deletedAt: null })).toThrow();
  });

  it("accepts only an id for delete", () => {
    expect(deleteCategorySchema.parse({ id: categoryId })).toEqual({ id: categoryId });
    expect(() =>
      deleteCategorySchema.parse({ id: categoryId, deletedByUserId: categoryId }),
    ).toThrow();
  });
});
