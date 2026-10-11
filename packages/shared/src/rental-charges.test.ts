import { describe, expect, it } from "vitest";

import type {
  RentalChargeTerms,
  RentalMeterReadingInput,
  UpdateRentalChargeTermsRequest,
  UpdateRentalMeterBaselineRequest,
} from "./rental-charges.js";

const contractId = "123e4567-e89b-42d3-a456-426614174000";

describe("租赁收费和计量共享契约", () => {
  it("定义水电类型，移除合同模式分支", async () => {
    const shared = await import("./index.js");

    expect(shared).not.toHaveProperty("rentalBillingModes");
    expect(shared.rentalMeterKinds).toEqual(["water", "electricity"]);
  });

  it("提供稳定条款、单次抄表和底数更新请求类型", () => {
    const terms: RentalChargeTerms = {
      contractId,
      version: "charge-v3",
      waterCollectionEnabled: true,
      electricityCollectionEnabled: true,
      waterUnitPrice: "12.5",
      electricityUnitPrice: "0",
      fixedFees: [{ id: contractId, name: "网费", periodAmountMinor: 5000 }],
    };
    const reading: RentalMeterReadingInput = {
      kind: "water",
      reading: "102.3456",
    };
    const updateTerms: UpdateRentalChargeTermsRequest = {
      contractId,
      expectedVersion: "terms-v2",
      idempotencyKey: contractId,
      reason: "按新合同约定调整单价",
      waterUnitPrice: "12.5",
      electricityUnitPrice: "0",
      fixedFees: [{ id: contractId, name: "网费", periodAmountMinor: 5000 }],
    };
    const updateBaseline: UpdateRentalMeterBaselineRequest = {
      contractId,
      readings: [reading, { ...reading, kind: "electricity", reading: "88" }],
      expectedVersion: "baseline-v1",
      idempotencyKey: contractId,
      reason: "入住交接底数",
    };

    expect(terms.fixedFees[0]?.periodAmountMinor).toBe(5000);
    expect(updateTerms.fixedFees[0]?.name).toBe("网费");
    expect(updateBaseline.readings.map(({ kind }) => kind)).toEqual(["water", "electricity"]);
  });
});
