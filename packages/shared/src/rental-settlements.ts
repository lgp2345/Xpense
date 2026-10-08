import type { RentalBillLine } from "./rental-bills.js";
import type { RentalFinancialBalance } from "./rental-cash.js";
import type { RentalExtraFeeInput, RentalMeterReadingInput } from "./rental-charges.js";

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

/** 结算独立快照中的账期成本，billId为空表示未出账的已履行账期。 */
export type RentalSettlementPeriodCharge = {
  billId: string | null;
  period: import("./rental-period-bills.js").RentalBillingPeriod;
  lines: RentalBillLine[];
  amountMinor: number;
};
export type RentalSettlementPreview = {
  version: string;
  canConfirm: boolean;
  missingFields: string[];
  effectiveEndDate: string;
  periodCharges: RentalSettlementPeriodCharge[];
  terminalLines: RentalBillLine[];
  extraLines: RentalBillLine[];
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
