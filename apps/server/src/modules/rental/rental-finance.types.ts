import type {
  PreviewRentalSettlementRequest,
  RentalBillDetail,
  RentalBillLine,
  RentalBillRevisionInput,
  RentalCashEntry,
  RentalChargeTerms,
  RentalContractDetail,
  RentalExtraFeeInput,
  RentalFeeSnapshot,
  RentalMeterReadingInput,
  RentalSettlementDetail,
} from "@xpense/shared";
import type { BillingTerms } from "./billing.types.js";

export type FinanceScope = { organizationId: string; contractId: string };

/** 计算上下文不携带操作者；写入服务单独传递 actor。 */
export type FinanceContext = FinanceScope & {
  today: string;
  currencyCode: string;
  timezone: string;
};

export type RentalMeterReading = RentalMeterReadingInput & {
  id: string;
  spaceId: string;
  contractId: string;
  revision: number;
  predecessorId: string | null;
};

export type RentalFinanceSnapshot = {
  context: FinanceContext;
  contract: RentalContractDetail;
  terms: RentalChargeTerms | null;
  readings: RentalMeterReading[];
  bills: RentalBillDetail[];
  cashEntries: RentalCashEntry[];
  settlement: RentalSettlementDetail | null;
  /** 取消动作的组织本地日期；无事实时保持 null，不从 today 推断。 */
  cancelledOn: string | null;
};

export type MonthlyChargeInput = {
  billingTerms: BillingTerms;
  billingMonth: string;
  effectiveEndDate: string | null;
  chargeTerms: RentalChargeTerms;
  readings: Record<
    "water" | "electricity",
    {
      previous: RentalMeterReading;
      current: RentalMeterReading;
    } | null
  >;
  extraFees: RentalExtraFeeInput[];
  overrides?: {
    waterUnitPrice?: string;
    electricityUnitPrice?: string;
    fixedFees?: Array<{ id: string; monthlyAmountMinor: number }>;
    reason: string;
  };
};

export type MonthlyChargeResult = { lines: RentalBillLine[]; amountMinor: number };

export type BillRevisionPlan = {
  bills: Array<{ billId: string; lines: RentalBillLine[]; amountMinor: number }>;
  readings: RentalMeterReading[];
  affectedBillIds: string[];
};

export type SettlementPlan = {
  effectiveEndDate: string;
  finalBills: Array<{
    billId: string | null;
    billingMonth: string;
    lines: RentalBillLine[];
    amountMinor: number;
  }>;
  finalCostMinor: number;
  differenceMinor: number;
};

export type CashWriteInput = Omit<
  RentalCashEntry,
  "id" | "createdAt" | "createdByUserId" | "revokedAt" | "revokedByUserId" | "revokeReason"
>;

export type RequestResult = {
  resourceId: string;
  resourceKind: "terms" | "baseline" | "bill" | "cash" | "revision" | "settlement";
};

export type { PreviewRentalSettlementRequest, RentalBillRevisionInput, RentalFeeSnapshot };
