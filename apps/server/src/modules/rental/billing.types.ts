import type {
  RentalBillAdjustment,
  RentalBillDetail,
  RentalBillingAnchor,
  RentalBillLine,
  RentalBillTotals,
  RentalBillType,
  RentalContractDepositTerm,
  RentalContractDetail,
  RentalPaymentIntervalMonths,
} from "@xpense/shared";

/** 已确认合同的非空计费输入。 */
export type BillingTerms = {
  startDate: string;
  endDate: string;
  rentAmountMinor: number;
  billingAnchor: RentalBillingAnchor;
  paymentIntervalMonths: RentalPaymentIntervalMonths;
  dueDaysBefore: number;
};
/** 不分配编号的纯应收草案，未填写押金到期日可为空。 */
export type BillingDraft = {
  type: RentalBillType;
  sourceKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  effectiveEnd: string | null;
  dueDate: string | null;
  amountMinor: number;
  lines: RentalBillLine[];
  depositSourceId: string | null;
  depositSnapshot: RentalContractDepositTerm | null;
};
export type BillingPlan = { drafts: BillingDraft[]; totals: RentalBillTotals };
/** 租金计算内已知非空的片段，避免把押金的空字段带入租金算法。 */
export type BillingRentLine = RentalBillLine & {
  periodStart: string;
  periodEnd: string;
  referenceStart: string;
  coveredDays: number;
  referenceDays: number;
  baseRentAmountMinor: number;
};
export type BillingRentDraft = Omit<BillingDraft, "periodStart" | "periodEnd" | "lines"> & {
  periodStart: string;
  periodEnd: string;
  lines: BillingRentLine[];
};
/** 财务内部合同：租期在来源边界投影为 YYYY-MM-DD，API 合同仍保留秒。 */
export type RentalBillingContract = Omit<
  RentalContractDetail,
  "startDate" | "endDate" | "actualEndDate"
> & {
  startDate: string | null;
  endDate: string | null;
  actualEndDate: string | null;
};
/** 同事务内取得的一致计费来源。 */
export type BillingSource = {
  organizationId: string;
  currencyCode: string;
  timezone: string;
  today: string;
  contract: RentalBillingContract;
  terminationRecordedAt: string | null;
  activeBills: RentalBillDetail[];
  adjustment: RentalBillAdjustment | null;
};
type PersistableBillingDraftBase = BillingDraft & {
  dueDate: string;
  adjustmentId: string | null;
};
/** 旧租金/押金调用默认落成 v1；v2 月度需月份，v2 押金月份留空。 */
export type PersistableBillingDraft = PersistableBillingDraftBase &
  (
    | { modelVersion?: 1; billingMonth?: null; revision?: number }
    | { type: "monthly"; modelVersion: 2; billingMonth: string; revision?: number }
    | { type: "deposit"; modelVersion: 2; billingMonth?: null; revision?: number }
  );
export type BillingWriteContext = { organizationId: string; userId: string; today: string };
