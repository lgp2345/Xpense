import type { UpsertTransactionRequest } from "@xpense/shared";
import { describe, expect, it } from "vitest";

import { buildMovements } from "./transaction-movements.js";

const baseInput: UpsertTransactionRequest = {
  ledgerId: "ledger-1",
  type: "expense",
  accountId: "cash",
  categoryId: "category-1",
  amountMinor: 1_200,
  occurredAt: "2026-08-23T12:00:00.000Z",
};

describe("buildMovements", () => {
  it("builds one negative movement for an expense", () => {
    expect(buildMovements(baseInput)).toEqual([{ accountId: "cash", amountMinor: -1_200 }]);
  });

  it("builds one positive movement for income", () => {
    expect(
      buildMovements({
        ...baseInput,
        type: "income",
        accountId: "bank",
        amountMinor: 500_000,
      }),
    ).toEqual([{ accountId: "bank", amountMinor: 500_000 }]);
  });

  it("builds balanced source and destination movements for a transfer", () => {
    expect(
      buildMovements({
        ...baseInput,
        type: "transfer",
        accountId: "bank",
        destinationAccountId: "wallet",
        categoryId: undefined,
        amountMinor: 10_000,
      }),
    ).toEqual([
      { accountId: "bank", amountMinor: -10_000 },
      { accountId: "wallet", amountMinor: 10_000 },
    ]);
  });

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1, 1.5])("rejects invalid amount %s", (amountMinor) => {
    expect(() => buildMovements({ ...baseInput, amountMinor })).toThrow();
  });

  it("rejects a transfer without a destination or with the same destination", () => {
    const transfer = { ...baseInput, type: "transfer" as const, categoryId: undefined };

    expect(() => buildMovements(transfer)).toThrow();
    expect(() =>
      buildMovements({ ...transfer, destinationAccountId: transfer.accountId }),
    ).toThrow();
  });

  it("rejects unsupported internal transaction types at runtime", () => {
    expect(() =>
      buildMovements({
        ...baseInput,
        type: "excluded_inflow",
      } as unknown as UpsertTransactionRequest),
    ).toThrow();
  });
});
