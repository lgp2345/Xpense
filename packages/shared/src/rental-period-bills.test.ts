import { describe, expect, expectTypeOf, it } from "vitest";
import { rentalBillTypes } from "./rental-bills.js";
import type {
  GenerateRentalPeriodBillRequest,
  RentalPeriodBillContext,
  VoidRentalPeriodBillRequest,
} from "./rental-period-bills.js";

describe("账期出账公共协议", () => {
  it("普通账单只有账期类型，不提供旧月度和整租期类型", () => {
    expect(rentalBillTypes).toEqual(["period", "deposit"]);
  });
  it("生成绑定期初和预览版本，作废绑定账单版本", () => {
    expectTypeOf<GenerateRentalPeriodBillRequest>()
      .toHaveProperty("periodStart")
      .toEqualTypeOf<string>();
    expectTypeOf<VoidRentalPeriodBillRequest>()
      .toHaveProperty("expectedVersion")
      .toEqualTypeOf<string>();
    expectTypeOf<RentalPeriodBillContext>().toHaveProperty("nextPeriod");
  });
});
