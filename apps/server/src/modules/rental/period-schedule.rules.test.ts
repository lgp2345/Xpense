import { describe, expect, it } from "vitest";
import type { BillingTerms } from "./billing.types.js";
import { selectNextBillingPeriod } from "./period-schedule.rules.js";

const terms: BillingTerms = {
  startDate: "2026-10-05",
  endDate: "2027-01-04",
  rentAmountMinor: 300000,
  billingAnchor: "contract_start",
  paymentIntervalMonths: 1,
  dueDaysBefore: 10,
};
const input = {
  terms,
  effectiveEndDate: terms.endDate,
  firstPeriodStart: terms.startDate,
  activePeriods: [],
};

describe("合同下一账期", () => {
  it("月付首期、下一期及全部覆盖，默认到期日为期初", () => {
    const first = selectNextBillingPeriod(input);
    expect(first).toMatchObject({
      periodStart: "2026-10-05",
      periodEnd: "2026-11-04",
      dueDate: "2026-10-05",
    });
    const activePeriods = [{ periodStart: "2026-10-05", periodEnd: "2026-11-04" }];
    expect(selectNextBillingPeriod({ ...input, activePeriods })).toMatchObject({
      periodStart: "2026-11-05",
      periodEnd: "2026-12-04",
    });
    expect(
      selectNextBillingPeriod({
        ...input,
        activePeriods: [
          ...activePeriods,
          { periodStart: "2026-11-05", periodEnd: "2026-12-04" },
          { periodStart: "2026-12-05", periodEnd: "2027-01-04" },
        ],
      }),
    ).toBeNull();
  });
  it.each([
    ["calendar_month", "2026-11-30"],
    ["contract_start", "2026-12-14"],
  ] as const)("%s 季付保留原始锚点", (billingAnchor, periodEnd) => {
    const seasonal = {
      ...terms,
      startDate: "2026-09-15",
      endDate: "2027-09-14",
      paymentIntervalMonths: 3 as const,
      billingAnchor,
    };
    expect(
      selectNextBillingPeriod({
        ...input,
        terms: seasonal,
        effectiveEndDate: seasonal.endDate,
        firstPeriodStart: seasonal.startDate,
      }),
    ).toMatchObject({ periodStart: seasonal.startDate, periodEnd });
  });
  it.each([2026, 2028])("%i 年 31 日锚点不漂移", (year) => {
    const anchored = { ...terms, startDate: `${year}-01-31`, endDate: `${year}-05-30` };
    const activePeriods = [
      { periodStart: `${year}-01-31`, periodEnd: `${year}-02-${year === 2028 ? "28" : "27"}` },
      { periodStart: `${year}-02-${year === 2028 ? "29" : "28"}`, periodEnd: `${year}-03-30` },
    ];
    expect(
      selectNextBillingPeriod({
        ...input,
        terms: anchored,
        effectiveEndDate: anchored.endDate,
        firstPeriodStart: anchored.startDate,
        activePeriods,
      }),
    ).toMatchObject({ periodStart: `${year}-03-31`, periodEnd: `${year}-04-29` });
  });
  it("接续不生成此前历史", () => {
    expect(
      selectNextBillingPeriod({
        ...input,
        terms: { ...terms, startDate: "2026-07-05" },
        firstPeriodStart: "2026-10-05",
      }),
    ).toMatchObject({ periodStart: "2026-10-05" });
  });
  it("拒绝非原始边界、中间缺口、重复期和错误末日", () => {
    expect(() => selectNextBillingPeriod({ ...input, firstPeriodStart: "2026-10-06" })).toThrow(
      /边界/,
    );
    expect(() =>
      selectNextBillingPeriod({
        ...input,
        activePeriods: [{ periodStart: "2026-11-05", periodEnd: "2026-12-04" }],
      }),
    ).toThrow(/连续/);
    expect(() =>
      selectNextBillingPeriod({
        ...input,
        activePeriods: [{ periodStart: "2026-10-05", periodEnd: "2026-11-03" }],
      }),
    ).toThrow(/边界/);
    expect(() =>
      selectNextBillingPeriod({
        ...input,
        activePeriods: Array(2).fill({ periodStart: "2026-10-05", periodEnd: "2026-11-04" }),
      }),
    ).toThrow(/连续/);
  });
  it("原始分期后截断实际结束日期，仍用参考月折算", () => {
    const next = selectNextBillingPeriod({ ...input, effectiveEndDate: "2026-10-20" });
    expect(next).toMatchObject({
      periodStart: "2026-10-05",
      periodEnd: "2026-10-20",
      amountMinor: 154839,
    });
    expect(next?.lines[0]).toMatchObject({
      coveredDays: 16,
      referenceDays: 31,
      referenceEnd: "2026-11-04",
    });
  });
  it("实际结束早于接续起点时不再出账", () => {
    expect(
      selectNextBillingPeriod({
        ...input,
        firstPeriodStart: "2026-11-05",
        effectiveEndDate: "2026-10-20",
      }),
    ).toBeNull();
  });
});
