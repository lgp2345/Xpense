import { describe, expect, it } from "vitest";

import { createAccountSchema } from "./create-account.dto.js";
import { deleteAccountSchema } from "./delete-account.dto.js";
import { updateAccountSchema } from "./update-account.dto.js";

describe("account DTO schemas", () => {
  it("trims names and accepts valid optional presentation fields", () => {
    expect(
      createAccountSchema.parse({
        name: "  银行卡  ",
        type: "bank",
        icon: "  wallet  ",
        color: "#12aBcF",
        sortOrder: 10,
        initialBalanceMinor: -500,
      }),
    ).toEqual({
      name: "银行卡",
      type: "bank",
      icon: "wallet",
      color: "#12aBcF",
      sortOrder: 10,
      initialBalanceMinor: -500,
    });
  });

  it("rejects unknown account type, unsafe balances and unknown keys", () => {
    expect(() => createAccountSchema.parse({ name: "账户", type: "crypto" })).toThrow();
    expect(() =>
      createAccountSchema.parse({
        name: "账户",
        type: "cash",
        initialBalanceMinor: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow();
    expect(() =>
      createAccountSchema.parse({ name: "账户", type: "cash", organizationId: "forged" }),
    ).toThrow();
  });

  it("requires an update field and allows clearing icon and color", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";

    expect(updateAccountSchema.parse({ id, icon: null, color: null })).toEqual({
      id,
      icon: null,
      color: null,
    });
    expect(() => updateAccountSchema.parse({ id })).toThrow();
    expect(() => deleteAccountSchema.parse({ id, deletedByUserId: "forged" })).toThrow();
  });
});
