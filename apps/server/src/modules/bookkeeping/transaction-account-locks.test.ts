import type { UpsertTransactionRequest } from "@xpense/shared";
import { describe, expect, it } from "vitest";

import {
  buildTransactionAccountLockIds,
  hasExactLockedAccounts,
} from "./transaction-account-locks.js";

const baseInput: UpsertTransactionRequest = {
  ledgerId: "ledger-1",
  type: "expense",
  accountId: "account-b",
  categoryId: "category-1",
  amountMinor: 1,
  occurredAt: "2026-08-23T12:00:00.000Z",
};

describe("transaction account locks", () => {
  it("returns one source account for income or expense", () => {
    expect(buildTransactionAccountLockIds(baseInput)).toEqual(["account-b"]);
  });

  it("deduplicates and sorts transfer account IDs into a stable lock order", () => {
    expect(
      buildTransactionAccountLockIds({
        ...baseInput,
        type: "transfer",
        categoryId: undefined,
        destinationAccountId: "account-a",
      }),
    ).toEqual(["account-a", "account-b"]);
  });

  it("rejects missing, same, or unexpected destination accounts", () => {
    expect(() =>
      buildTransactionAccountLockIds({ ...baseInput, type: "transfer", categoryId: undefined }),
    ).toThrow();
    expect(() =>
      buildTransactionAccountLockIds({
        ...baseInput,
        type: "transfer",
        categoryId: undefined,
        destinationAccountId: baseInput.accountId,
      }),
    ).toThrow();
    expect(() =>
      buildTransactionAccountLockIds({ ...baseInput, destinationAccountId: "account-a" }),
    ).toThrow();
  });

  it("accepts only an exact unique set of locked accounts", () => {
    const requested = ["account-a", "account-b"];

    expect(hasExactLockedAccounts(requested, [{ id: "account-b" }, { id: "account-a" }])).toBe(
      true,
    );
    expect(hasExactLockedAccounts(requested, [{ id: "account-a" }])).toBe(false);
    expect(hasExactLockedAccounts(requested, [{ id: "account-a" }, { id: "account-c" }])).toBe(
      false,
    );
    expect(hasExactLockedAccounts(requested, [{ id: "account-a" }, { id: "account-a" }])).toBe(
      false,
    );
  });
});
