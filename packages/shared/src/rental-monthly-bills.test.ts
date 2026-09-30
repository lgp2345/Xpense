import { describe, expect, it } from "vitest";

import type { RentalBillLine, RentalBillSummary } from "./rental-bills.js";
import type {
  GenerateRentalMonthlyBillRequest,
  PreviewRentalMonthlyBillRequest,
  RentalBillRevisionInput,
  RentalExtraFeeInput,
} from "./rental-monthly-bills.js";

const contractId = "123e4567-e89b-42d3-a456-426614174000";
const billId = "223e4567-e89b-42d3-a456-426614174000";

describe("租赁月度账单共享契约", () => {
  it("增加月度费用、计量快照与兼容账单字段", async () => {
    const shared = await import("./index.js");
    const extraFee: RentalExtraFeeInput = {
      id: billId,
      name: "优惠",
      amountMinor: -10000,
      note: "本期减免",
    };
    const line: RentalBillLine = {
      kind: "extra_fee",
      label: "优惠",
      amountMinor: -10000,
      periodStart: null,
      periodEnd: null,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 1,
      note: "本期减免",
      feeSnapshot: { kind: "extra_fee", extraFeeId: billId, origin: "monthly" },
    };
    const monthlyBill: RentalBillSummary = {
      id: billId,
      billNumber: "RB-2026-000001",
      contractId,
      contractNumber: "RC-2026-000001",
      propertyId: billId,
      propertyName: "阳光公寓",
      currencyCode: "CNY",
      type: "monthly",
      status: "active",
      sourceKey: "monthly:2026-09",
      periodStart: null,
      periodEnd: null,
      effectiveEnd: null,
      dueDate: "2026-09-30",
      amountMinor: 0,
      dueState: "upcoming",
      createdAt: "2026-09-01T00:00:00.000Z",
      modelVersion: 2,
      billingMonth: "2026-09",
      settlementId: null,
      revision: 1,
      financial: null,
    };

    expect(shared.rentalBillTypes).toEqual(["rent", "deposit", "monthly"]);
    expect(extraFee.amountMinor).toBe(-10000);
    expect(line.feeSnapshot).toEqual({ kind: "extra_fee", extraFeeId: billId, origin: "monthly" });
    expect(monthlyBill.billingMonth).toBe("2026-09");
  });

  it("为预览、确认和历史修订提供独立请求类型", () => {
    const preview: PreviewRentalMonthlyBillRequest = {
      contractId,
      billingMonth: "2026-09",
      extraFees: [],
    };
    const generate: GenerateRentalMonthlyBillRequest = {
      ...preview,
      dueDate: "2026-09-30",
      readings: [
        { kind: "water", readingDate: "2026-09-01", reading: "1" },
        { kind: "electricity", readingDate: "2026-09-01", reading: "2" },
      ],
      expectedVersion: "preview-v1",
      idempotencyKey: billId,
    };
    const revision: RentalBillRevisionInput = {
      billId,
      expectedVersion: "bill-v3",
      reason: "更正电表抄录",
    };

    expect(preview.readings).toBeUndefined();
    expect(generate.dueDate).toBe("2026-09-30");
    expect(revision.reason).toBe("更正电表抄录");
  });
});
