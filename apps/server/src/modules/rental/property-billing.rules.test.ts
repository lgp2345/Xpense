import { describe, expect, it } from "vitest";
import { rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { nextPeriod } from "./period-bill-plan.rules.js";
import {
  billingStartDayDistance,
  type PropertyBillingSource,
  toPropertyBillingCandidate,
} from "./property-billing.rules.js";

function source(): PropertyBillingSource {
  const s = rentalFinanceSnapshot();
  return {
    contractId: s.contract.id,
    spaceId: s.contract.spaces[0]!.spaceId,
    terms: {
      startDate: s.contract.startDate!,
      endDate: s.contract.endDate!,
      rentAmountMinor: s.contract.rentAmountMinor!,
      billingAnchor: s.contract.billingAnchor!,
      paymentIntervalMonths: s.contract.paymentIntervalMonths!,
      dueDaysBefore: s.contract.dueDaysBefore!,
    },
    lifecycleStatus: "confirmed",
    cancelled: false,
    settled: false,
    spaceCount: 1,
    terminationDate: null,
    firstPeriodStart: null,
    activePeriods: [],
    path: [{ id: s.contract.spaces[0]!.spaceId, parentId: null, name: "101", sortOrder: 0 }],
    tenantPeriods: [{ name: "租户", validFrom: "2026-01-01", validTo: "2026-12-31" }],
  };
}
describe("房产出账候选", () => {
  it.each([
    ["2026-10-02", -16],
    ["2026-10-03", -15],
    ["2026-10-04", -14],
    ["2026-10-18", 0],
    ["2026-11-01", 14],
    ["2026-11-02", 15],
    ["2026-11-03", 16],
  ] as const)("日期 %s", (date, days) =>
    expect(billingStartDayDistance("2026-10-18", date)).toBe(days));
  it("闰日及严格日期", () => {
    expect(billingStartDayDistance("2028-02-28", "2028-03-01")).toBe(2);
    expect(() => billingStartDayDistance("2026-02-30", "2026-03-01")).toThrow();
  });
  it.each(["draft", "cancelled"] as const)("排除 %s", (lifecycleStatus) =>
    expect(toPropertyBillingCandidate({ ...source(), lifecycleStatus }, "2026-10-18")).toBeNull());
  it.each([
    { cancelled: true },
    { settled: true },
    { spaceCount: 2 },
  ])("排除不合格来源 %j", (patch) =>
    expect(toPropertyBillingCandidate({ ...source(), ...patch }, "2026-10-18")).toBeNull());
  it("未来合同仍可出账，未结算终止可出账", () => {
    const s = source();
    expect(toPropertyBillingCandidate(s, "2025-01-01")?.period.periodStart).toBe("2026-01-01");
    expect(
      toPropertyBillingCandidate(
        { ...s, lifecycleStatus: "terminated", terminationDate: "2026-02-15" },
        "2026-10-18",
      ),
    ).not.toBeNull();
  });
  it.each([1, 3] as const)("与现有 nextPeriod 一致：%s 月", (interval) => {
    const s = source();
    s.terms.paymentIntervalMonths = interval;
    const snapshot = rentalFinanceSnapshot();
    snapshot.contract.paymentIntervalMonths = interval;
    expect(toPropertyBillingCandidate(s, "2026-10-18")?.period).toEqual(
      expect.objectContaining({
        periodStart: nextPeriod(snapshot)!.periodStart,
        periodEnd: nextPeriod(snapshot)!.periodEnd,
      }),
    );
  });
  it("接续、连续有效账单与终止截断复用规则", () => {
    const s = source();
    s.terms.paymentIntervalMonths = 1;
    s.firstPeriodStart = "2026-10-01";
    s.terminationDate = "2026-11-15";
    s.activePeriods = [{ periodStart: "2026-10-01", periodEnd: "2026-10-31" }];
    expect(toPropertyBillingCandidate(s, "2026-10-18")?.period).toEqual({
      periodStart: "2026-11-01",
      periodEnd: "2026-11-15",
    });
    s.activePeriods.push({ periodStart: "2026-11-01", periodEnd: "2026-11-15" });
    expect(toPropertyBillingCandidate(s, "2026-10-18")).toBeNull();
  });
  it("断档不得吞掉", () =>
    expect(() =>
      toPropertyBillingCandidate(
        { ...source(), activePeriods: [{ periodStart: "2026-10-01", periodEnd: "2026-12-31" }] },
        "2026-10-18",
      ),
    ).toThrow(/连续/));
});
