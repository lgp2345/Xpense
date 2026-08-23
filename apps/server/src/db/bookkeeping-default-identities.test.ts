import { describe, expect, it } from "vitest";

import {
  deriveDefaultAccountId,
  deriveDefaultCategoryId,
  deriveDefaultLedgerId,
} from "./bookkeeping-default-identities.js";

const organizationId = "11111111-1111-1111-1111-111111111111";

describe("bookkeeping default deterministic identities", () => {
  it("matches the canonical md5 UUID vectors that PostgreSQL migrations can reproduce", () => {
    expect(deriveDefaultLedgerId(organizationId)).toBe("653a20e7-e1d0-ba21-1f35-57059e9dd71d");
    expect(deriveDefaultAccountId(organizationId)).toBe("8fac6e23-21b1-d4d4-4e37-1c4cbc3bb389");
    expect(
      deriveDefaultCategoryId(
        organizationId,
        "22222222-2222-2222-2222-222222222222",
        "expense",
        "dining",
      ),
    ).toBe("6c5699b2-a361-a534-8d29-6f6ad2ab7891");
  });
});
