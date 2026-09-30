import { describe, expect, it } from "vitest";

import type {
  ConfirmRentalDepositReceiptRequest,
  ConfirmRentalRefundRequest,
  RecordRentalReceiptRequest,
  RentalCashEntry,
  RentalCashTarget,
  RentalFinancialBalance,
  RevokeRentalCashRequest,
} from "./rental-cash.js";

const id = "123e4567-e89b-42d3-a456-426614174000";

describe("租赁收退款共享契约", () => {
  it("声明收退款状态、类别和两种互斥目标", async () => {
    const shared = await import("./index.js");

    expect(shared.rentalCashKinds).toEqual(["receipt", "refund"]);
    expect(shared.rentalCashPurposes).toEqual([
      "bill_receipt",
      "deposit_receipt",
      "settlement_receipt",
      "refund",
    ]);
    expect(shared.rentalFinancialStates).toEqual(["unpaid", "partial", "settled", "refundable"]);
  });

  it("使用正数收退款事实并保留可撤销历史字段", () => {
    const billTarget: RentalCashTarget = { kind: "bill", billId: id };
    const settlementTarget: RentalCashTarget = { kind: "settlement", settlementId: id };
    const receipt: RecordRentalReceiptRequest = {
      target: billTarget,
      amountMinor: 50000,
      occurredOn: "2026-09-27",
      note: "转账到账",
      expectedVersion: "balance-v1",
      idempotencyKey: id,
    };
    const depositReceipt: ConfirmRentalDepositReceiptRequest = {
      billId: id,
      occurredOn: "2026-09-27",
      note: "押金已到账",
      expectedVersion: "balance-v1",
      idempotencyKey: id,
    };
    const refund: ConfirmRentalRefundRequest = {
      target: settlementTarget,
      occurredOn: "2026-09-27",
      expectedVersion: "settlement-v2",
      idempotencyKey: id,
    };
    const revoke: RevokeRentalCashRequest = {
      entryId: id,
      reason: "误登记",
      expectedVersion: "balance-v1",
      idempotencyKey: id,
    };
    const entry: RentalCashEntry = {
      id,
      contractId: id,
      target: billTarget,
      kind: "receipt",
      purpose: "bill_receipt",
      amountMinor: 50000,
      occurredOn: "2026-09-27",
      note: null,
      createdAt: "2026-09-27T00:00:00.000Z",
      createdByUserId: id,
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
    };
    const balance: RentalFinancialBalance = {
      receivedMinor: 50000,
      refundedMinor: 0,
      netReceivedMinor: 50000,
      outstandingMinor: 0,
      refundableMinor: 0,
      state: "settled",
      overdue: false,
      version: "balance-v1",
    };

    expect(receipt.amountMinor).toBe(50000);
    expect(depositReceipt).not.toHaveProperty("amountMinor");
    expect(refund).not.toHaveProperty("amountMinor");
    expect(revoke.reason).toBe("误登记");
    expect(entry.revokedAt).toBeNull();
    expect(balance.netReceivedMinor).toBe(50000);
  });
});
