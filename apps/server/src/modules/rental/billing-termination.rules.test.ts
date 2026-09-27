import { describe, expect, it } from "vitest";
import { calculateTerminationReference } from "./billing-termination.rules.js";

const terms = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  rentAmountMinor: 300000,
  billingAnchor: "calendar_month" as const,
  paymentIntervalMonths: 3 as const,
  dueDaysBefore: 0,
};
describe("原付款账期的终止参考", () => {
  it("按季付完整期定位，在月度片段层折算", () => {
    expect(calculateTerminationReference(terms, "2026-05-15")).toMatchObject({
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      originalAmountMinor: 900000,
      referenceAmountMinor: 445161,
    });
  });
  it("终止期首日和期末按包含首尾日处理", () => {
    expect(calculateTerminationReference(terms, "2026-04-01").referenceAmountMinor).toBe(10000);
    expect(calculateTerminationReference(terms, "2026-06-30").referenceAmountMinor).toBe(900000);
  });
  it("拒绝租期外终止日期", () => {
    expect(() => calculateTerminationReference(terms, "2027-01-01")).toThrow();
  });
});
