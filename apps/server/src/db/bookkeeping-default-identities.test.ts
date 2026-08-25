import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  deriveDefaultAccountId,
  deriveDefaultCategoryId,
  deriveDefaultLedgerId,
} from "./bookkeeping-default-identities.js";

const organizationId = "11111111-1111-1111-1111-111111111111";

describe("bookkeeping default deterministic identities", () => {
  it("matches the canonical UUIDv8 vectors that PostgreSQL migrations can reproduce", () => {
    const identities = [
      deriveDefaultLedgerId(organizationId),
      deriveDefaultAccountId(organizationId),
      deriveDefaultCategoryId(
        organizationId,
        "22222222-2222-2222-2222-222222222222",
        "expense",
        "dining",
      ),
    ];

    expect(identities).toEqual([
      "653a20e7-e1d0-8a21-9f35-57059e9dd71d",
      "8fac6e23-21b1-84d4-8e37-1c4cbc3bb389",
      "6c5699b2-a361-8534-8d29-6f6ad2ab7891",
    ]);

    for (const identity of identities) {
      expect(z.uuid({ version: "v8" }).safeParse(identity).success).toBe(true);
    }
  });
});
