import type { RentalBillLine } from "./rental-bills.js";
import type { RentalFinancialBalance } from "./rental-cash.js";
import type { RentalMeterReadingInput } from "./rental-charges.js";
import type { RentalExtraFeeInput } from "./rental-monthly-bills.js";

/** 合同统一结算所对应的生命周期事件。 */
export const rentalSettlementKinds = ["termination", "expiry", "cancellation"] as const;
export type RentalSettlementKind = (typeof rentalSettlementKinds)[number];

/** 已确认结算的待收、待退或结清状态。 */
export const rentalSettlementStatuses = [
  "pending_collection",
  "pending_refund",
  "settled",
] as const;
export type RentalSettlementStatus = (typeof rentalSettlementStatuses)[number];

/** 预览整份合同截至有效结束日的结算。 */
export type PreviewRentalSettlementRequest = {
  contractId: string;
  finalReadings?: RentalMeterReadingInput[];
  extraFees: RentalExtraFeeInput[];
};

/** 确认当前预览版本的合同结算。 */
export type ConfirmRentalSettlementRequest = PreviewRentalSettlementRequest & {
  expectedVersion: string;
  idempotencyKey: string;
};

/** 结算预览中的既有账单变化或待补建月份。 */
export type RentalSettlementBillChange = {
  billId: string | null;
  billingMonth: string;
  lines: RentalBillLine[];
  amountMinor: number;
  changeAmountMinor: number;
};

/** 整份合同的最终费用与实际收退款差额预览。 */
export type RentalSettlementPreview = {
  version: string;
  canConfirm: boolean;
  missingFields: string[];
  effectiveEndDate: string;
  billChanges: RentalSettlementBillChange[];
  finalCostMinor: number;
  receivedMinor: number;
  refundedMinor: number;
  differenceMinor: number;
};

/** 已确认的合同统一结算及其当前余额。 */
export type RentalSettlementDetail = {
  id: string;
  contractId: string;
  eventId: string;
  kind: RentalSettlementKind;
  effectiveEndDate: string;
  version: string;
  revision: number;
  finalCostMinor: number;
  balance: RentalFinancialBalance;
  status: RentalSettlementStatus;
  confirmedAt: string;
  confirmedByUserId: string;
};
