import { expect, it } from "vitest";
import { rentalFinanceSnapshot } from "../../test/rental-finance-fixtures.js";
import { assertPeriodBillVoidable } from "./period-bill-lifecycle.rules.js";

function source() {
  const value = rentalFinanceSnapshot();
  value.bills = [
    { id: "first", type: "period", status: "active", periodStart: "2026-01-01" },
    { id: "last", type: "period", status: "active", periodStart: "2026-02-01" },
    { id: "deposit", type: "deposit", status: "active", periodStart: null },
  ] as never;
  return value;
}
it("只能从后往前作废有效普通期，押金不参加", () => {
  const value = source();
  expect(() => assertPeriodBillVoidable(value, "first")).toThrow(/最后一期/);
  expect(() => assertPeriodBillVoidable(value, "last")).not.toThrow();
  expect(() => assertPeriodBillVoidable(value, "deposit")).toThrow(/普通账单/);
});
it("净收为零仍需撤销有效收退款记录", () => {
  const value = source();
  value.cashEntries = [
    {
      target: { kind: "bill", billId: "last" },
      kind: "receipt",
      amountMinor: 100,
      revokedAt: null,
    },
    { target: { kind: "bill", billId: "last" }, kind: "refund", amountMinor: 100, revokedAt: null },
  ] as never;
  expect(() => assertPeriodBillVoidable(value, "last")).toThrow(/撤销/);
  value.cashEntries.forEach((entry) => {
    entry.revokedAt = "2026-08-31";
  });
  expect(() => assertPeriodBillVoidable(value, "last")).not.toThrow();
});
it("结算和作废状态阻断", () => {
  const value = source();
  value.settlement = { id: "settlement" } as never;
  expect(() => assertPeriodBillVoidable(value, "last")).toThrow(/结算/);
  value.settlement = null;
  value.bills[1]!.status = "voided";
  expect(() => assertPeriodBillVoidable(value, "last")).toThrow(/作废/);
});
