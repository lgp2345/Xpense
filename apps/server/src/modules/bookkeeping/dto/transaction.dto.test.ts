import { describe, expect, it } from "vitest";

import { createTransactionSchema } from "./create-transaction.dto.js";
import { deleteTransactionSchema } from "./delete-transaction.dto.js";
import { listTransactionsSchema } from "./list-transactions.dto.js";
import { transactionDetailSchema } from "./transaction-detail.dto.js";
import { updateTransactionSchema } from "./update-transaction.dto.js";

const ledgerId = "123e4567-e89b-12d3-a456-426614174000";
const accountId = "223e4567-e89b-12d3-a456-426614174000";
const destinationAccountId = "323e4567-e89b-12d3-a456-426614174000";
const categoryId = "423e4567-e89b-12d3-a456-426614174000";
const transactionId = "523e4567-e89b-12d3-a456-426614174000";

describe("transaction DTO schemas", () => {
  it("coerces pagination and accepts every supported list filter", () => {
    expect(
      listTransactionsSchema.parse({
        ledgerId,
        accountId,
        categoryId,
        type: "expense",
        keyword: "  房租  ",
        from: "2026-08-01",
        to: "2026-08-31",
        page: "2",
        pageSize: "25",
      }),
    ).toEqual({
      ledgerId,
      accountId,
      categoryId,
      type: "expense",
      keyword: "房租",
      from: "2026-08-01",
      to: "2026-08-31",
      page: 2,
      pageSize: 25,
    });
  });

  it("defaults pagination and rejects invalid dates, reversed ranges and unknown list keys", () => {
    expect(listTransactionsSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(() => listTransactionsSchema.parse({ from: "2026-02-30" })).toThrow();
    expect(() => listTransactionsSchema.parse({ from: "2026-08-31", to: "2026-08-01" })).toThrow();
    expect(() => listTransactionsSchema.parse({ organizationId: ledgerId })).toThrow();
    expect(() => listTransactionsSchema.parse({ type: "excluded_inflow" })).toThrow();
  });

  it("trims optional text and accepts a valid ordinary transaction input", () => {
    expect(
      createTransactionSchema.parse({
        ledgerId,
        type: "transfer",
        accountId,
        destinationAccountId,
        amountMinor: 10_000,
        occurredAt: "2026-08-23T16:30:00.000Z",
        payee: "  储蓄账户  ",
        note: "  月度转存  ",
      }),
    ).toEqual({
      ledgerId,
      type: "transfer",
      accountId,
      destinationAccountId,
      amountMinor: 10_000,
      occurredAt: "2026-08-23T16:30:00.000Z",
      payee: "储蓄账户",
      note: "月度转存",
    });
  });

  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid transaction amount %s", (amountMinor) => {
    expect(() =>
      createTransactionSchema.parse({
        ledgerId,
        type: "expense",
        accountId,
        categoryId,
        amountMinor,
        occurredAt: "2026-08-23T16:30:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects internal types, invalid timestamps, blank text and forged fields", () => {
    const valid = {
      ledgerId,
      type: "expense",
      accountId,
      categoryId,
      amountMinor: 100,
      occurredAt: "2026-08-23T16:30:00.000Z",
    };

    expect(() => createTransactionSchema.parse({ ...valid, type: "excluded_outflow" })).toThrow();
    expect(() => createTransactionSchema.parse({ ...valid, occurredAt: "not-a-date" })).toThrow();
    expect(() =>
      createTransactionSchema.parse({ ...valid, occurredAt: "2026-02-30T00:00:00.000Z" }),
    ).toThrow();
    expect(() => createTransactionSchema.parse({ ...valid, payee: "   " })).toThrow();
    expect(() => createTransactionSchema.parse({ ...valid, organizationId: ledgerId })).toThrow();
  });

  it("requires the full shared business input plus id when updating", () => {
    const update = {
      id: transactionId,
      ledgerId,
      type: "income" as const,
      accountId,
      categoryId,
      amountMinor: 500,
      occurredAt: "2026-08-23T16:30:00+08:00",
    };

    expect(updateTransactionSchema.parse(update)).toEqual(update);
    expect(() => updateTransactionSchema.parse({ id: transactionId, amountMinor: 500 })).toThrow();
  });

  it("accepts only an id for detail and delete", () => {
    expect(transactionDetailSchema.parse({ id: transactionId })).toEqual({ id: transactionId });
    expect(deleteTransactionSchema.parse({ id: transactionId })).toEqual({ id: transactionId });
    expect(() => transactionDetailSchema.parse({ id: transactionId, userId: accountId })).toThrow();
    expect(() => deleteTransactionSchema.parse({ id: "invalid" })).toThrow();
  });
});
