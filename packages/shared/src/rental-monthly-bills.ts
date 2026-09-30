import type { RentalBillLine } from "./rental-bills.js";
import type { RentalChargeTerms, RentalMeterReadingInput } from "./rental-charges.js";

/** 综合账单中的有符号额外费用；备注不承担金额正负语义。 */
export type RentalExtraFeeInput = {
  id: string;
  name: string;
  amountMinor: number;
  note: string;
};

/** 本期非租金价格覆盖，不修改合同默认收费标准。 */
export type RentalMonthlyChargeOverrides = {
  waterUnitPrice?: string;
  electricityUnitPrice?: string;
  fixedFees?: Array<{ id: string; monthlyAmountMinor: number }>;
  reason: string;
};

/** 预览当月综合账单；缺少必要输入时返回待完善预览。 */
export type PreviewRentalMonthlyBillRequest = {
  contractId: string;
  billingMonth: string;
  dueDate?: string;
  readings?: RentalMeterReadingInput[];
  overrides?: RentalMonthlyChargeOverrides;
  extraFees: RentalExtraFeeInput[];
};

/** 确认生成当月综合账单。 */
export type GenerateRentalMonthlyBillRequest = PreviewRentalMonthlyBillRequest & {
  dueDate: string;
  readings: RentalMeterReadingInput[];
  expectedVersion: string;
  idempotencyKey: string;
};

/** 修订已确认账单的输入；不允许直接调整合同租金。 */
export type RentalBillRevisionInput = {
  billId: string;
  expectedVersion: string;
  readings?: RentalMeterReadingInput[];
  overrides?: RentalMonthlyChargeOverrides;
  extraFees?: RentalExtraFeeInput[];
  reason: string;
};

/** 账单更正影响及已确认结算差额预览。 */
export type RentalBillRevisionPreview = {
  version: string;
  affectedBills: Array<{
    billId: string;
    beforeAmountMinor: number;
    afterAmountMinor: number;
  }>;
  settlementDifferenceMinor: number | null;
};

/** 月度账单预览，包括缺项、收费标准快照和当前计量底数。 */
export type RentalMonthlyBillPreview = {
  version: string;
  canConfirm: boolean;
  missingFields: string[];
  defaults: RentalChargeTerms;
  baselineReadings: RentalMeterReadingInput[];
  lines: RentalBillLine[];
  amountMinor: number;
  billingMonth: string;
  existingBillId: string | null;
};
