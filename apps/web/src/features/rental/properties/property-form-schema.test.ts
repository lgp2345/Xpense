import { describe, expect, it } from "vitest";

import { propertyFormSchema } from "./property-form-schema";

describe("propertyFormSchema", () => {
  it("accepts the server-aligned maximum lengths", () => {
    const result = propertyFormSchema.safeParse({
      name: "房产",
      type: "other",
      customTypeName: "自".repeat(120),
      countryCode: "CN",
      province: "省".repeat(120),
      city: "市".repeat(120),
      district: "区".repeat(120),
      addressLine: "址".repeat(500),
      note: "注".repeat(2000),
    });

    expect(result.success).toBe(true);
  });
});
