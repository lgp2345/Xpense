import type {
  PreviewRentalSettlementRequest,
  RentalBillDetail,
  RentalBillLine,
  RentalCashEntry,
  RentalChargeTerms,
  RentalExtraFeeInput,
  RentalFeeSnapshot,
  RentalMeterReadingInput,
  RentalSettlementDetail,
} from "@xpense/shared";
import type { BillingTerms, RentalBillingContract } from "./billing.types.js";

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
  source: "contract" | "billing_start" | "bill" | "settlement";
  billingStartId: string | null;
  billId: string | null;
  settlementId: string | null;
};

export type RentalFinanceSnapshot = {
  context: FinanceContext;
  contract: RentalBillingContract;
  terms: RentalChargeTerms | null;
  billingStart: BillingStartRecord | null;
  readings: RentalMeterReading[];
  bills: RentalBillDetail[];
  cashEntries: RentalCashEntry[];
  settlement: RentalSettlementDetail | null;
  /** 取消动作的组织本地日期；无事实时保持 null，不从 today 推断。 */
  cancelledOn: string | null;
};

export type CashWriteInput = Omit<
  RentalCashEntry,
  "id" | "createdAt" | "createdByUserId" | "revokedAt" | "revokedByUserId" | "revokeReason"
>;

export type RequestResult = {
  resourceId: string;
  resourceKind: "terms" | "baseline" | "bill" | "generation" | "cash" | "revision" | "settlement";
};

export type { PreviewRentalSettlementRequest, RentalFeeSnapshot };

export type BillingStartRecord = FinanceScope & {
  id: string;
  firstPeriodStart: string;
  version: number;
  baselineReadings: RentalMeterReading[];
};
