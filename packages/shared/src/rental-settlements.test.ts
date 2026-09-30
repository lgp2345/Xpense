import { describe, expect, it } from "vitest";

import type {
  ConfirmRentalSettlementRequest,
  PreviewRentalSettlementRequest,
  RentalSettlementDetail,
  RentalSettlementPreview,
} from "./rental-settlements.js";

const id = "123e4567-e89b-42d3-a456-426614174000";

describe("租赁合同结算共享契约", () => {
  it("公开合同结算事件和资金状态", async () => {
    const shared = await import("./index.js");

    expect(shared.rentalSettlementKinds).toEqual(["termination", "expiry", "cancellation"]);
    expect(shared.rentalSettlementStatuses).toEqual([
      "pending_collection",
      "pending_refund",
      "settled",
    ]);
  });

  it("保留费用变更、累计实收退款和版本历史的类型", () => {
    const preview: RentalSettlementPreview = {
      version: "settlement-v1",
      canConfirm: false,
      missingFields: ["finalReadings"],
      effectiveEndDate: "2026-09-27",
      billChanges: [
        {
          billId: null,
          billingMonth: "2026-09",
          lines: [],
          amountMinor: 10000,
          changeAmountMinor: 10000,
        },
      ],
      finalCostMinor: 10000,
      receivedMinor: 5000,
      refundedMinor: 0,
      differenceMinor: 5000,
    };
    const input: PreviewRentalSettlementRequest = { contractId: id, extraFees: [] };
    const confirmation: ConfirmRentalSettlementRequest = {
      ...input,
      expectedVersion: preview.version,
      idempotencyKey: id,
    };
    const detail: RentalSettlementDetail = {
      id,
      contractId: id,
      eventId: id,
      kind: "termination",
      effectiveEndDate: "2026-09-27",
      version: "settlement-v1",
      revision: 1,
      finalCostMinor: 10000,
      balance: {
        receivedMinor: 5000,
        refundedMinor: 0,
        netReceivedMinor: 5000,
        outstandingMinor: 5000,
        refundableMinor: 0,
        state: "partial",
        overdue: false,
        version: "settlement-v1",
      },
      status: "pending_collection",
      confirmedAt: "2026-09-27T00:00:00.000Z",
      confirmedByUserId: id,
    };

    expect(input.finalReadings).toBeUndefined();
    expect(confirmation.finalReadings).toBeUndefined();
    expect(preview.differenceMinor).toBe(5000);
    expect(detail.status).toBe("pending_collection");
  });
});
