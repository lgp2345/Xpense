import { describe, expect, it } from "vitest";
import { rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { buildRentPlan } from "./billing-period.rules.js";
import { calculatePeriodCharges, type PeriodChargeInput } from "./period-charge.rules.js";

const source = rentalFinanceSnapshot();
function input(): PeriodChargeInput {
  return {
    rent: buildRentPlan({
      startDate: "2026-10-05",
      endDate: "2027-01-04",
      rentAmountMinor: 300000,
      billingAnchor: "contract_start",
      paymentIntervalMonths: 3,
      dueDaysBefore: 0,
    }).drafts[0]!,
    chargeTerms: {
      ...source.terms!,
      fixedFees: [{ id: "fee", name: "管理费", periodAmountMinor: 10000 }],
    },
    readings: { water: null, electricity: null },
    extraFees: [],
  };
}
describe("每账期收费快照", () => {
  it("季付只收一次固定费", () => {
    expect(calculatePeriodCharges(input()).amountMinor).toBe(910000);
  });
  it("不足完整期仍保留完整固定费", () => {
    const value = input();
    value.rent = { ...value.rent, periodEnd: "2026-10-20" };
    expect(
      calculatePeriodCharges(value).lines.find((line) => line.kind === "fixed_fee"),
    ).toMatchObject({ amountMinor: 10000, feeSnapshot: { calculationMode: "full_period" } });
  });
  it.each([
    ["3500", "3600", 30000],
    ["3600", "3600", 0],
  ])("同日 %s→%s", (start, end, amount) => {
    const value = input();
    const previous = { ...source.readings[0]!, reading: start };
    value.readings.water = {
      previous,
      current: {
        ...previous,
        id: "next",
        predecessorId: previous.id,
        reading: end,
        source: "bill",
        billId: "bill",
      },
    };
    expect(
      calculatePeriodCharges(value).lines.find((line) => line.kind === "water")?.amountMinor,
    ).toBe(amount);
  });
  it("水电费用行和快照不再记录抄表起止日期", () => {
    const value = input();
    const previous = source.readings[0]!;
    value.readings.water = {
      previous,
      current: {
        ...previous,
        id: "next",
        predecessorId: previous.id,
        reading: "101",
        source: "bill",
        billId: "bill",
      },
    };
    const line = calculatePeriodCharges(value).lines.find((item) => item.kind === "water");
    expect(line).toMatchObject({ periodStart: null, periodEnd: null, amountMinor: 300 });
    expect(line?.feeSnapshot).not.toHaveProperty("startDate");
    expect(line?.feeSnapshot).not.toHaveProperty("endDate");
  });
  it("递减读数拒绝", () => {
    const value = input();
    const previous = source.readings[0]!;
    value.readings.water = {
      previous,
      current: { ...previous, id: "next", predecessorId: previous.id, reading: "99" },
    };
    expect(() => calculatePeriodCharges(value)).toThrow();
  });
  it("金额溢出拒绝，禁用表计不收费", () => {
    const value = input();
    value.extraFees = [
      { id: "extra", name: "溢出", amountMinor: Number.MAX_SAFE_INTEGER, note: "" },
    ];
    expect(() => calculatePeriodCharges(value)).toThrow(/安全整数/);
  });
  it("四位小数以分舍入", () => {
    const value = input();
    const previous = { ...source.readings[0]!, reading: "0.0000" };
    value.readings.water = {
      previous,
      current: { ...previous, id: "next", predecessorId: previous.id, reading: "0.0050" },
    };
    value.chargeTerms.waterUnitPrice = "1.0000";
    expect(
      calculatePeriodCharges(value).lines.find((line) => line.kind === "water")?.amountMinor,
    ).toBe(1);
  });
  it("不同合同或空间不能互作前驱", () => {
    const value = input();
    const previous = source.readings[0]!;
    value.readings.water = {
      previous,
      current: { ...previous, id: "next", predecessorId: previous.id, spaceId: "another" },
    };
    expect(() => calculatePeriodCharges(value)).toThrow(/边界/);
  });
});
it("单张账单额外费用标识不能重复", () => {
  const value = input();
  const fee = { id: "same", name: "额外费", amountMinor: 1, note: "按实" };
  expect(() => calculatePeriodCharges({ ...value, extraFees: [fee, fee] })).toThrow(/标识/);
});
