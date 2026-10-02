import type { RentalBillDetail } from "@xpense/shared";
import { describe, expect, it } from "vitest";
import {
  billRevisionErrors,
  initialBillRevisionValues,
  toBillRevisionInput,
} from "./bill-revision-form";
import { billFixture } from "./bill-test-fixtures";

const bill: RentalBillDetail = {
  ...billFixture,
  modelVersion: 2,
  type: "monthly",
  financial: {
    version: "saved-v1",
    receivedMinor: 0,
    refundedMinor: 0,
    netReceivedMinor: 0,
    outstandingMinor: 4500,
    refundableMinor: 0,
    overdue: false,
    state: "unpaid",
  },
  lines: [
    {
      kind: "water",
      label: "水费",
      amountMinor: 1500,
      periodStart: "2026-08-31",
      periodEnd: "2026-09-30",
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 0,
      feeSnapshot: {
        kind: "water",
        startReadingId: "start",
        endReadingId: "end",
        startDate: "2026-08-31",
        endDate: "2026-09-30",
        startReading: "100.0000",
        endReading: "115.0000",
        unitPrice: "1.0000",
        overrideReason: null,
      },
    },
    {
      kind: "fixed_fee",
      label: "物业费",
      amountMinor: 3000,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      referenceStart: "2026-09-01",
      referenceEnd: "2026-09-30",
      coveredDays: 30,
      referenceDays: 30,
      baseRentAmountMinor: null,
      sortOrder: 1,
      feeSnapshot: {
        kind: "fixed_fee",
        feeId: "fixed-id",
        monthlyAmountMinor: 3000,
        overrideReason: null,
      },
    },
  ],
};

const waterLine = bill.lines.find((line) => line.feeSnapshot?.kind === "water");
if (waterLine?.feeSnapshot?.kind !== "water") throw new Error("测试水费快照缺失");
const savedWater = waterLine.feeSnapshot;
const splitBill: RentalBillDetail = {
  ...bill,
  lines: [
    {
      ...waterLine,
      feeSnapshot: {
        ...savedWater,
        endReadingId: "middle",
        endDate: "2026-09-10",
        endReading: "110",
        unitPrice: "1",
      },
    },
    {
      ...waterLine,
      feeSnapshot: {
        ...savedWater,
        startReadingId: "middle",
        startDate: "2026-09-10",
        startReading: "110",
        endReadingId: "final",
        endDate: "2026-09-20",
        endReading: "115",
        unitPrice: "2",
      },
    },
  ],
};

function draft() {
  const values = initialBillRevisionValues(bill);
  const [meter] = values.meters;
  const [fixedFee] = values.fixedFees;
  if (!meter || !fixedFee) throw new Error("测试账单应包含水表与固定月费");
  return {
    ...values,
    meters: [meter] as [typeof meter],
    fixedFees: [fixedFee] as [typeof fixedFee],
    reason: "更正保存快照",
  };
}

describe("已确认账单的更正输入", () => {
  it("默认和等值十进制输入不覆盖历史读数或价格", () => {
    const values = draft();
    values.meters[0].endReading = "115";
    values.meters[0].unitPrice = "1";
    const input = toBillRevisionInput(bill, values);
    expect(input).toMatchObject({
      billId: bill.id,
      expectedVersion: "saved-v1",
      reason: values.reason,
    });
    expect(input?.readings).toBeUndefined();
    expect(input?.overrides).toBeUndefined();
  });
  it("可用原日期更正上次共享读数，不误改本次或发无契约readingId", () => {
    const values = draft();
    values.meters[0].startReading = "99.5";
    expect(toBillRevisionInput(bill, values)?.readings).toEqual([
      { kind: "water", readingDate: "2026-08-31", reading: "99.5" },
    ]);
  });
  it("本次日期不能等于上次日期，否则API会定位到错误边界", () => {
    const values = draft();
    values.meters[0].endDate = "2026-08-31";
    expect(toBillRevisionInput(bill, values)).toBeNull();
    expect(billRevisionErrors(bill, values).has("meters.0.endDate")).toBe(true);
  });
  it("同时改同表两次抄表会明确拒绝，不能静默丢弃一边", () => {
    const values = draft();
    values.meters[0].startReading = "99";
    values.meters[0].endReading = "116";
    expect(toBillRevisionInput(bill, values)).toBeNull();
    expect(billRevisionErrors(bill, values).has("meters.0.endReading")).toBe(true);
  });
  it("价格和固定月费按原feeId单独覆盖，金额精确到分", () => {
    const values = draft();
    values.meters[0].unitPrice = "2.5000";
    values.fixedFees[0].amount = "35.25";
    expect(toBillRevisionInput(bill, values)?.overrides).toEqual({
      waterUnitPrice: "2.5000",
      fixedFees: [{ id: "fixed-id", monthlyAmountMinor: 3525 }],
      reason: values.reason,
    });
  });
  it("允许固定月费改为零，但拒绝负额、过量精度和numeric范围外读数", () => {
    const values = draft();
    values.fixedFees[0].amount = "0";
    expect(toBillRevisionInput(bill, values)?.overrides?.fixedFees).toEqual([
      { id: "fixed-id", monthlyAmountMinor: 0 },
    ]);
    for (const invalid of ["115.00001", "10000000000000000", "-1"]) {
      values.meters[0].endReading = invalid;
      expect(toBillRevisionInput(bill, values)).toBeNull();
    }
  });
  it("退租转入同种表计的第二段保持各自保存价格，未编辑也能预览", () => {
    const values = { ...initialBillRevisionValues(splitBill), reason: "仅改说明" };
    expect(billRevisionErrors(splitBill, values).size).toBe(0);
    const input = toBillRevisionInput(splitBill, values);
    expect(input).not.toBeNull();
    expect(input?.readings).toBeUndefined();
    expect(input?.overrides).toBeUndefined();
  });
  it("同单两段共享真实边界只发一个更正，并拒绝两个不同边界", () => {
    const values = { ...initialBillRevisionValues(splitBill), reason: "核实共同读数" };
    values.meters = values.meters.map((meter, index) =>
      index === 0 ? { ...meter, endReading: "111" } : { ...meter, startReading: "111" },
    );
    expect(toBillRevisionInput(splitBill, values)?.readings).toEqual([
      { kind: "water", readingDate: "2026-09-10", reading: "111" },
    ]);
    values.meters = values.meters.map((meter, index) =>
      index === 1 ? { ...meter, endReading: "116" } : meter,
    );
    expect(toBillRevisionInput(splitBill, values)).toBeNull();
    expect(billRevisionErrors(splitBill, values).has("meters.1.endReading")).toBe(true);
  });
  it("多段统一改价才发kind覆盖，单段误改或无法定位的新日期明确拒绝", () => {
    const values = { ...initialBillRevisionValues(splitBill), reason: "更正本单统一价格" };
    values.meters = values.meters.map((meter, index) =>
      index === 0 ? { ...meter, unitPrice: "3" } : meter,
    );
    expect(toBillRevisionInput(splitBill, values)).toBeNull();
    values.meters = values.meters.map((meter) => ({ ...meter, unitPrice: "3" }));
    expect(toBillRevisionInput(splitBill, values)?.overrides).toEqual({
      waterUnitPrice: "3",
      reason: values.reason,
    });
    values.meters = values.meters.map((meter, index) =>
      index === 1 ? { ...meter, endDate: "2026-09-21" } : meter,
    );
    expect(toBillRevisionInput(splitBill, values)).toBeNull();
    expect(billRevisionErrors(splitBill, values).has("meters.1.endDate")).toBe(true);
  });
});
