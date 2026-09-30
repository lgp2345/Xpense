import { describe, expect, it } from "vitest";

import {
  confirmRentalDepositReceiptSchema,
  confirmRentalRefundSchema,
  recordRentalReceiptSchema,
  revokeRentalCashSchema,
} from "./rental-cash.dto.js";
import { updateRentalChargeTermsSchema } from "./rental-charges.dto.js";
import { updateRentalMeterBaselineSchema } from "./rental-meters.dto.js";
import {
  generateRentalMonthlyBillSchema,
  previewRentalMonthlyBillSchema,
  reviseRentalBillSchema,
} from "./rental-monthly-bills.dto.js";
import {
  confirmRentalSettlementSchema,
  previewRentalSettlementSchema,
} from "./rental-settlements.dto.js";

const contractId = "123e4567-e89b-42d3-a456-426614174000";
const billId = "223e4567-e89b-42d3-a456-426614174000";
const settlementId = "323e4567-e89b-42d3-a456-426614174000";
const idempotencyKey = "423e4567-e89b-42d3-a456-426614174000";

const validReadings = [
  { kind: "water", readingDate: "2026-09-01", reading: "100.0001" },
  { kind: "electricity", readingDate: "2026-09-01", reading: "50" },
] as const;

const validExtraFee = {
  id: billId,
  name: "优惠",
  amountMinor: -10000,
  note: "本期减免",
};

const validMonthlyInput = {
  contractId,
  billingMonth: "2026-09",
  dueDate: "2026-09-30",
  readings: [...validReadings],
  extraFees: [validExtraFee],
  expectedVersion: "monthly-preview-v1",
  idempotencyKey,
};

const validReceiptInput = {
  target: { kind: "bill", billId },
  amountMinor: 50000,
  occurredOn: "2026-09-27",
  note: "转账到账",
  expectedVersion: "balance-v1",
  idempotencyKey,
};

const validRefundInput = {
  target: { kind: "settlement", settlementId },
  occurredOn: "2026-09-27",
  note: "已线下退还",
  expectedVersion: "settlement-v1",
  idempotencyKey,
};

describe("租赁收费与结算 DTO", () => {
  it("为每个写入 schema 接受独立合法请求并保留预览缺项", () => {
    expect(
      updateRentalChargeTermsSchema.safeParse({
        contractId,
        expectedVersion: "terms-v1",
        idempotencyKey,
        reason: "按合同补充固定费用",
        waterUnitPrice: "12.5",
        electricityUnitPrice: "0",
        fixedFees: [{ id: billId, name: "网费", monthlyAmountMinor: 5000 }],
      }).success,
    ).toBe(true);
    expect(
      updateRentalMeterBaselineSchema.safeParse({
        contractId,
        readings: [...validReadings],
        expectedVersion: "baseline-v1",
        idempotencyKey,
        reason: "入住交接底数",
      }).success,
    ).toBe(true);
    expect(
      previewRentalMonthlyBillSchema.safeParse({
        contractId,
        billingMonth: "2026-09",
        extraFees: [],
      }).success,
    ).toBe(true);
    expect(
      generateRentalMonthlyBillSchema.safeParse({
        ...validMonthlyInput,
        extraFees: [{ ...validExtraFee, amountMinor: -10000, note: "  本期减免  " }],
      }).success,
    ).toBe(true);
    expect(
      reviseRentalBillSchema.safeParse({
        billId,
        expectedVersion: "bill-v2",
        idempotencyKey,
        reason: "更正电表抄录",
      }).success,
    ).toBe(true);
    expect(recordRentalReceiptSchema.safeParse(validReceiptInput).success).toBe(true);
    expect(
      confirmRentalDepositReceiptSchema.safeParse({
        billId,
        occurredOn: "2026-09-27",
        expectedVersion: "deposit-v1",
        idempotencyKey,
      }).success,
    ).toBe(true);
    expect(confirmRentalRefundSchema.safeParse(validRefundInput).success).toBe(true);
    expect(
      revokeRentalCashSchema.safeParse({
        entryId: billId,
        reason: "误登记",
        expectedVersion: "cash-v1",
        idempotencyKey,
      }).success,
    ).toBe(true);
    expect(previewRentalSettlementSchema.safeParse({ contractId, extraFees: [] }).success).toBe(
      true,
    );
    expect(
      confirmRentalSettlementSchema.safeParse({
        contractId,
        extraFees: [],
        expectedVersion: "settlement-preview-v1",
        idempotencyKey,
      }).success,
    ).toBe(true);
  });

  it("允许有符号额外费用及空备注并去除首尾空白", () => {
    const parsed = generateRentalMonthlyBillSchema.safeParse({
      ...validMonthlyInput,
      extraFees: [{ ...validExtraFee, amountMinor: -10000, note: "  本期减免  " }],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.extraFees[0]).toMatchObject({ amountMinor: -10000, note: "本期减免" });
    }
    expect(
      generateRentalMonthlyBillSchema.safeParse({
        ...validMonthlyInput,
        extraFees: [{ ...validExtraFee, note: "   " }],
      }).success,
    ).toBe(true);
  });

  it("限制水电读数和单价精度、正负号及数据库整数位范围", () => {
    const updateInput = {
      contractId,
      expectedVersion: "terms-v1",
      idempotencyKey,
      reason: "调整水电价格",
      waterUnitPrice: "1234567890123456.1234",
      electricityUnitPrice: "0",
      fixedFees: [],
    };
    expect(updateRentalChargeTermsSchema.safeParse(updateInput).success).toBe(true);
    for (const price of ["1.12345", "12345678901234567", "-1", "+1", "1e2"]) {
      expect(
        updateRentalChargeTermsSchema.safeParse({ ...updateInput, waterUnitPrice: price }).success,
      ).toBe(false);
    }
    for (const reading of ["-1", "+1", "1e2", "1.12345", "12345678901234567"]) {
      expect(
        generateRentalMonthlyBillSchema.safeParse({
          ...validMonthlyInput,
          readings: [{ ...validReadings[0], reading }, validReadings[1]],
        }).success,
      ).toBe(false);
    }
    expect(
      generateRentalMonthlyBillSchema.safeParse({
        ...validMonthlyInput,
        readings: [{ ...validReadings[0], reading: "1234567890123456.1234" }, validReadings[1]],
      }).success,
    ).toBe(true);
  });

  it("拒绝非法年月、日期、重复读数类型及预览缺项用于正式确认", () => {
    for (const billingMonth of ["2026-00", "2026-13", "2026-9", "2026-09-01"]) {
      expect(
        previewRentalMonthlyBillSchema.safeParse({
          contractId,
          billingMonth,
          extraFees: [],
        }).success,
      ).toBe(false);
    }
    for (const date of ["2026-02-29", "2026-04-31", "2026-9-01"]) {
      expect(
        generateRentalMonthlyBillSchema.safeParse({
          ...validMonthlyInput,
          readings: [{ ...validReadings[0], readingDate: date }, validReadings[1]],
        }).success,
      ).toBe(false);
    }
    expect(
      updateRentalMeterBaselineSchema.safeParse({
        contractId,
        readings: [validReadings[0], { ...validReadings[1], kind: "water" }],
        expectedVersion: "baseline-v1",
        idempotencyKey,
        reason: "入住交接底数",
      }).success,
    ).toBe(false);
    expect(
      generateRentalMonthlyBillSchema.safeParse({ ...validMonthlyInput, readings: [] }).success,
    ).toBe(false);
    expect(
      generateRentalMonthlyBillSchema.safeParse({ ...validMonthlyInput, dueDate: undefined })
        .success,
    ).toBe(false);
  });

  it("允许结算预览部分或空末读数，但确认拒绝不完整及重复类型", () => {
    expect(
      previewRentalSettlementSchema.safeParse({
        contractId,
        finalReadings: [validReadings[0]],
        extraFees: [],
      }).success,
    ).toBe(true);
    expect(
      previewRentalSettlementSchema.safeParse({ contractId, finalReadings: [], extraFees: [] })
        .success,
    ).toBe(true);
    expect(
      previewRentalSettlementSchema.safeParse({
        contractId,
        finalReadings: [validReadings[0], { ...validReadings[0], readingDate: "2026-09-02" }],
        extraFees: [],
      }).success,
    ).toBe(false);
    expect(
      confirmRentalSettlementSchema.safeParse({
        contractId,
        finalReadings: [validReadings[0]],
        extraFees: [],
        expectedVersion: "settlement-v1",
        idempotencyKey,
      }).success,
    ).toBe(false);
  });

  it("拒绝年份零的月度账期并接受合法的 0001 年一月", () => {
    const firstYearReadings = validReadings.map((reading) => ({
      ...reading,
      readingDate: "0001-01-01",
    }));

    expect(
      previewRentalMonthlyBillSchema.safeParse({
        contractId,
        billingMonth: "0000-09",
        extraFees: [],
      }).success,
    ).toBe(false);
    expect(
      generateRentalMonthlyBillSchema.safeParse({
        ...validMonthlyInput,
        billingMonth: "0000-09",
      }).success,
    ).toBe(false);
    expect(
      previewRentalMonthlyBillSchema.safeParse({
        contractId,
        billingMonth: "0001-01",
        extraFees: [],
      }).success,
    ).toBe(true);
    expect(
      generateRentalMonthlyBillSchema.safeParse({
        ...validMonthlyInput,
        billingMonth: "0001-01",
        dueDate: "0001-01-31",
        readings: firstYearReadings,
      }).success,
    ).toBe(true);
  });

  it("拒绝空原因、双重目标、零收款和客户端决定的押金或退款金额", () => {
    expect(
      updateRentalChargeTermsSchema.safeParse({
        contractId,
        expectedVersion: "terms-v1",
        idempotencyKey,
        reason: "  ",
        waterUnitPrice: "1",
        electricityUnitPrice: "1",
        fixedFees: [],
      }).success,
    ).toBe(false);
    expect(
      recordRentalReceiptSchema.safeParse({ ...validReceiptInput, amountMinor: 0 }).success,
    ).toBe(false);
    expect(
      recordRentalReceiptSchema.safeParse({
        ...validReceiptInput,
        target: { kind: "bill", billId, settlementId },
      }).success,
    ).toBe(false);
    expect(
      recordRentalReceiptSchema.safeParse({ ...validReceiptInput, amountMinor: 0.5 }).success,
    ).toBe(false);
    expect(
      confirmRentalDepositReceiptSchema.safeParse({
        billId,
        amountMinor: 50000,
        occurredOn: "2026-09-27",
        expectedVersion: "deposit-v1",
        idempotencyKey,
      }).success,
    ).toBe(false);
    expect(
      confirmRentalRefundSchema.safeParse({ ...validRefundInput, amountMinor: 50000 }).success,
    ).toBe(false);
    expect(
      revokeRentalCashSchema.safeParse({
        entryId: billId,
        reason: " ",
        expectedVersion: "cash-v1",
        idempotencyKey,
      }).success,
    ).toBe(false);
  });

  it("拒绝普通租金金额、未声明字段和错误的结算读数集合", () => {
    expect(
      generateRentalMonthlyBillSchema.safeParse({ ...validMonthlyInput, rentAmountMinor: 800000 })
        .success,
    ).toBe(false);
    expect(
      previewRentalMonthlyBillSchema.safeParse({
        contractId,
        billingMonth: "2026-09",
        extraFees: [],
        organizationId: contractId,
      }).success,
    ).toBe(false);
    expect(
      confirmRentalSettlementSchema.safeParse({
        contractId,
        extraFees: [],
        finalReadings: [validReadings[0]],
        expectedVersion: "settlement-v1",
        idempotencyKey,
      }).success,
    ).toBe(false);
    expect(
      confirmRentalSettlementSchema.safeParse({
        contractId,
        extraFees: [],
        finalReadings: [...validReadings],
        expectedVersion: "settlement-v1",
        idempotencyKey,
      }).success,
    ).toBe(true);
  });
});
