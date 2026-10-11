import type { PageResult } from "./bookkeeping.js";
import type { RentalBillLine } from "./rental-bills.js";
import type {
  RentalChargeTerms,
  RentalExtraFeeInput,
  RentalMeterReadingInput,
} from "./rental-charges.js";

export type RentalBillingPeriod = { periodStart: string; periodEnd: string };
export type RentalBillingStartInput = {
  firstPeriodStart: string;
  baselineReadings: RentalMeterReadingInput[];
};
export type RentalPeriodChargeOverrides = {
  waterUnitPrice?: string;
  electricityUnitPrice?: string;
  fixedFees?: Array<{ id: string; periodAmountMinor: number }>;
  reason: string;
};
export type PreviewRentalPeriodBillRequest = {
  contractId: string;
  periodStart: string;
  note?: string;
  billingStart?: RentalBillingStartInput;
  dueDate?: string;
  readings?: RentalMeterReadingInput[];
  overrides?: RentalPeriodChargeOverrides;
  extraFees: RentalExtraFeeInput[];
};
export type GenerateRentalPeriodBillRequest = PreviewRentalPeriodBillRequest & {
  dueDate: string;
  readings: RentalMeterReadingInput[];
  expectedVersion: string;
  idempotencyKey: string;
};
export type VoidRentalPeriodBillRequest = {
  billId: string;
  reason: string;
  expectedVersion: string;
  idempotencyKey: string;
};
/** 服务端上下文只提供默认值，客户端不计算账期。 */
export type RentalPeriodBillContext = {
  version: string;
  billingStart: RentalBillingStartInput | null;
  canSelectBillingStart: boolean;
  nextPeriod: RentalBillingPeriod | null;
  defaultDueDate: string | null;
  defaults: RentalChargeTerms;
  baselineReadings: RentalMeterReadingInput[];
  defaultReadings: RentalMeterReadingInput[];
  selectablePeriods: PageResult<RentalBillingPeriod>;
  missingFields: string[];
};
export type RentalPeriodBillPreview = {
  version: string;
  period: RentalBillingPeriod;
  dueDate: string;
  baselineReadings: RentalMeterReadingInput[];
  defaultReadings: RentalMeterReadingInput[];
  defaults: RentalChargeTerms;
  lines: RentalBillLine[];
  amountMinor: number;
  missingFields: string[];
  canConfirm: boolean;
};
