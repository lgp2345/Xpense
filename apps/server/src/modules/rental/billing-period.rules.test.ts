import { describe, expect, it } from "vitest";
import type { BillingTerms } from "./billing.types.js";
import { buildRentPlan, prorateBillingAmount } from "./billing-period.rules.js";

const terms: BillingTerms = {
  startDate: "2026-09-15",
  endDate: "2026-10-20",
  rentAmountMinor: 300000,
  billingAnchor: "contract_start",
  paymentIntervalMonths: 1,
  dueDaysBefore: 0,
};

describe("整租期计费", () => {
  it("按起租日参考月先舍入每日单价，再乘尾期天数", () => {
    const plan = buildRentPlan(terms);
    expect(plan.drafts.map((x) => x.amountMinor)).toEqual([300000, 58062]);
    expect(plan.drafts[1]?.lines[0]).toMatchObject({
      periodStart: "2026-10-15",
      periodEnd: "2026-10-20",
      referenceEnd: "2026-11-14",
      coveredDays: 6,
      referenceDays: 31,
    });
    expect(plan.totals).toEqual({ rentAmountMinor: 358062, depositAmountMinor: 0 });
  });
  it.each([
    [50000, 21, 31, 33873],
    [50000, 31, 31, 50000],
    [50000, 10, 29, 17240],
    [50000, 10, 28, 17860],
    [14, 14, 28, 14],
    [1, 14, 28, 0],
    [Number.MAX_SAFE_INTEGER, 30, 31, 8716644440071920],
  ])("月租 %i 分、覆盖 %i/%i 天应收 %i 分", (amount, covered, reference, expected) => {
    expect(prorateBillingAmount(amount, covered, reference)).toBe(expected);
  });
  it("自然月季付首残月归入第一期", () => {
    const plan = buildRentPlan({
      ...terms,
      billingAnchor: "calendar_month",
      paymentIntervalMonths: 3,
      endDate: "2027-08-31",
    });
    expect(plan.drafts[0]).toMatchObject({
      periodStart: "2026-09-15",
      periodEnd: "2026-11-30",
      amountMinor: 760000,
    });
    expect(plan.drafts).toHaveLength(4);
  });
  it.each([1, 3, 6, 12] as const)("付款周期 %i 完整分组", (interval) => {
    const plan = buildRentPlan({
      ...terms,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      paymentIntervalMonths: interval,
    });
    expect(plan.drafts).toHaveLength(12 / interval);
    expect(plan.drafts[0]?.amountMinor).toBe(300000 * interval);
    expect(plan.totals.rentAmountMinor).toBe(3600000);
  });
  it.each([2026, 2028])("%i 年月末锚点不漂移", (year) => {
    const plan = buildRentPlan({ ...terms, startDate: `${year}-01-31`, endDate: `${year}-04-29` });
    expect(plan.drafts.map((x) => x.periodStart)).toEqual([
      `${year}-01-31`,
      `${year}-02-${year === 2028 ? 29 : 28}`,
      `${year}-03-31`,
    ]);
    expect(plan.drafts.map((x) => x.amountMinor)).toEqual([300000, 300000, 300000]);
  });
  it("保留零额单日、半数向上舍入", () => {
    expect(
      buildRentPlan({
        ...terms,
        startDate: "2026-02-01",
        endDate: "2026-02-01",
        rentAmountMinor: 1,
        billingAnchor: "calendar_month",
      }).drafts[0]?.amountMinor,
    ).toBe(0);
    expect(
      buildRentPlan({
        ...terms,
        startDate: "2026-02-01",
        endDate: "2026-02-14",
        rentAmountMinor: 14,
      }).drafts[0]?.amountMinor,
    ).toBe(14);
  });
  it("到期日跨年且不采用生成当天", () => {
    expect(
      buildRentPlan({ ...terms, startDate: "2026-01-01", endDate: "2026-01-31", dueDaysBefore: 10 })
        .drafts[0]?.dueDate,
    ).toBe("2025-12-22");
  });
  it("支持日期上限的完整参考月，不截短长租期", () => {
    const last = buildRentPlan({ ...terms, startDate: "9999-12-31", endDate: "9999-12-31" });
    expect(last.drafts[0]?.lines[0]).toMatchObject({
      referenceDays: 31,
      coveredDays: 1,
      amountMinor: 9677,
    });
    expect(
      buildRentPlan({ ...terms, startDate: "2026-01-01", endDate: "2055-12-31" }).drafts,
    ).toHaveLength(360);
  });
  it("拒绝超出整数范围的月租、账单和整批汇总", () => {
    expect(() => buildRentPlan({ ...terms, rentAmountMinor: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      /安全整数/,
    );
    expect(() =>
      buildRentPlan({ ...terms, rentAmountMinor: Number.MAX_SAFE_INTEGER, endDate: "2026-11-14" }),
    ).toThrow(/安全整数/);
    expect(() => buildRentPlan({ ...terms, startDate: "0001-01-01", dueDaysBefore: 1 })).toThrow(
      /范围/,
    );
  });
});
