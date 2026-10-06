import { describe, expect, it } from "vitest";
import { billCashBatchSchema, canRegisterBillReceipt, cashAmountText } from "./bill-cash-model";
import { billFixture } from "./bill-test-fixtures";

const bill = {
  ...billFixture,
  modelVersion: 2 as const,
  financial: {
    receivedMinor: 0,
    refundedMinor: 0,
    netReceivedMinor: 0,
    outstandingMinor: 12345,
    refundableMinor: 0,
    state: "unpaid" as const,
    overdue: false,
    version: "v",
  },
};
describe("列表收款可操作性", () => {
  it("只允许有对应权限和余额的独立新版账单", () => {
    expect(canRegisterBillReceipt(bill, ["rental_receipts:create"])).toBe(true);
    expect(canRegisterBillReceipt(bill, ["rental_refunds:create"])).toBe(false);
    expect(canRegisterBillReceipt({ ...bill, modelVersion: 1 }, ["rental_receipts:create"])).toBe(
      false,
    );
    expect(
      canRegisterBillReceipt({ ...bill, settlementId: "settlement" }, ["rental_receipts:create"]),
    ).toBe(false);
    expect(
      canRegisterBillReceipt({ ...bill, financial: { ...bill.financial, outstandingMinor: 0 } }, [
        "rental_receipts:create",
      ]),
    ).toBe(false);
    const refund = {
      ...bill,
      financial: { ...bill.financial, outstandingMinor: 0, refundableMinor: 5000 },
    };
    expect(canRegisterBillReceipt(refund, ["rental_refunds:create"])).toBe(false);
    expect(canRegisterBillReceipt(refund, ["rental_receipts:create"])).toBe(false);
  });
  it.each([
    [1, "0.01"],
    [12345, "123.45"],
    [10000, "100.00"],
  ])("金额 %i 保留正确的小数位", (minor, expected) => {
    expect(cashAmountText(Number(minor))).toBe(expected);
  });
  it.each([
    "",
    "-1",
    "0",
    "123.46",
    "1.234",
    "not-a-number",
  ])("拒绝无效普通收款金额 %s", (amount) => {
    expect(
      billCashBatchSchema([bill]).safeParse({
        occurredOn: "2026-10-06",
        note: "",
        amounts: { bill: amount },
      }).success,
    ).toBe(false);
  });
  it("允许部分收款、全额收款，押金不要求输入金额", () => {
    for (const amount of ["0.01", "123.45"]) {
      expect(
        billCashBatchSchema([bill]).safeParse({
          occurredOn: "2026-10-06",
          note: "",
          amounts: { bill: amount },
        }).success,
      ).toBe(true);
    }
    expect(
      billCashBatchSchema([{ ...bill, type: "deposit" }]).safeParse({
        occurredOn: "2026-10-06",
        note: "",
        amounts: {},
      }).success,
    ).toBe(true);
  });
  it.each(["", "2026-02-30", "2026/10/06"])("拒绝缺失或无效发生日期 %s", (occurredOn) => {
    expect(
      billCashBatchSchema([bill]).safeParse({
        occurredOn,
        note: "",
        amounts: { bill: "123.45" },
      }).success,
    ).toBe(false);
  });
});
