import type { PageResult } from "./bookkeeping.js";
import type { RentalFinancialBalance } from "./rental-cash.js";
import type { RentalContractSpace } from "./rental-contracts.js";

/** 应收费用分类；押金不计入租金。 */
export const rentalBillTypes = ["rent", "deposit", "monthly"] as const;
export type RentalBillType = (typeof rentalBillTypes)[number];
/** 账单费用行类型；月度明细和历史租金／押金行共用该稳定枚举。 */
export const rentalBillLineKinds = [
  "rent_period",
  "deposit",
  "termination_adjustment",
  "water",
  "electricity",
  "fixed_fee",
  "extra_fee",
] as const;
export type RentalBillLineKind = (typeof rentalBillLineKinds)[number];
/** 有效不代表付款状态。 */
export const rentalBillStatuses = ["active", "voided"] as const;
export type RentalBillStatus = (typeof rentalBillStatuses)[number];
/** 仅表示到期日期，不推断是否已收款。 */
export const rentalBillDueStates = ["upcoming", "due_today", "date_passed"] as const;
export type RentalBillDueState = (typeof rentalBillDueStates)[number];

/** 生成时保存的计算片段；终止差额行允许负值。 */
export type RentalFeeSnapshot =
  | {
      kind: "water" | "electricity";
      startReadingId: string;
      endReadingId: string;
      startDate: string;
      endDate: string;
      startReading: string;
      endReading: string;
      unitPrice: string;
      overrideReason: string | null;
    }
  | {
      kind: "fixed_fee";
      feeId: string;
      monthlyAmountMinor: number;
      overrideReason: string | null;
    }
  | { kind: "extra_fee"; extraFeeId: string; origin: "monthly" | "settlement" };

export type RentalBillLine = {
  kind: RentalBillLineKind;
  label: string;
  amountMinor: number;
  periodStart: string | null;
  periodEnd: string | null;
  referenceStart: string | null;
  referenceEnd: string | null;
  coveredDays: number | null;
  referenceDays: number | null;
  baseRentAmountMinor: number | null;
  sortOrder: number;
  note?: string;
  feeSnapshot?: RentalFeeSnapshot;
};

/** 账单列表安全摘要，金额为基础币种最小单位整数。 */
export type RentalBillSummary = {
  id: string;
  billNumber: string;
  contractId: string;
  contractNumber: string;
  propertyId: string;
  propertyName: string;
  currencyCode: string;
  type: RentalBillType;
  status: RentalBillStatus;
  sourceKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  effectiveEnd: string | null;
  dueDate: string;
  amountMinor: number;
  dueState: RentalBillDueState | null;
  createdAt: string;
  /** 缺失表示 legacy 响应，不根据日期推断账单版本。 */
  modelVersion?: 1 | 2;
  billingMonth?: string | null;
  financial?: RentalFinancialBalance | null;
  settlementId?: string | null;
  revision?: number;
};

/** 终止财务事件；撤销保留历史，后续同日终止使用新 ID。 */
export type RentalBillAdjustment = {
  id: string;
  contractId: string;
  terminationDate: string;
  terminationRecordedAt: string;
  periodStart: string;
  periodEnd: string;
  originalAmountMinor: number;
  referenceAmountMinor: number;
  finalAmountMinor: number;
  reason: string;
  createdAt: string;
  revokedAt: string | null;
};

/** 账单生成时安全快照，不复制证件、联系方式等个人敏感字段。 */
export type RentalBillSnapshot = {
  propertyId: string;
  propertyName: string;
  contractNumber: string;
  spaces: RentalContractSpace[];
  parties: Array<{ tenantId: string; name: string; isPrimaryPayer: boolean }>;
};

/** 账单详情与有界同来源历史。 */
export type RentalBillDetail = RentalBillSummary & {
  lines: RentalBillLine[];
  generationId: string | null;
  adjustmentId: string | null;
  adjustment: RentalBillAdjustment | null;
  snapshot: RentalBillSnapshot;
  voidReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  history: RentalBillSummary[];
};

export type RentalBillTotals = {
  rentAmountMinor: number;
  depositAmountMinor: number;
  /** 新版本综合账单金额；缺失表示 legacy 汇总响应。 */
  monthlyAmountMinor?: number;
  /** 独立统计有效收退款及待收待退，避免由账单费用总额推断资金。 */
  financial?: {
    receivedMinor: number;
    refundedMinor: number;
    outstandingMinor: number;
    refundableMinor: number;
  };
};
/** 完整适用计划的覆盖数量，与列表筛选及分页无关。 */
export type RentalBillCoverage = {
  existingRentCount: number;
  existingDepositCount: number;
  missingRentCount: number;
  missingDepositCount: number;
};
export type ListRentalBillsQuery = Partial<{
  contractId: string;
  propertyId: string;
  keyword: string;
  type: RentalBillType;
  status: RentalBillStatus;
  dueDateFrom: string;
  dueDateTo: string;
  page: number;
  pageSize: number;
}>;
export type RentalBillPage = PageResult<RentalBillSummary> & {
  totals: RentalBillTotals;
  coverage: RentalBillCoverage | null;
};
/** 确认整张终止当期应收，允许零；不扣除任何推断的已收金额。 */
export type RentalBillTerminationConfirmation = { finalAmountMinor: number; reason: string };
export type RentalBillGenerationInput = {
  contractId: string;
  depositDueDates: Record<string, string>;
  /** v2 合同仅允许显式生成独立押金账单。 */
  scope?: "deposits";
  terminationConfirmation?: RentalBillTerminationConfirmation;
};
export type PreviewRentalBillsRequest = RentalBillGenerationInput & {
  expectedVersion?: string;
  page?: number;
  pageSize?: number;
};
/** 生成完整计划，接口不接受分页或正常租金金额。 */
export type GenerateRentalBillsRequest = RentalBillGenerationInput & {
  expectedVersion: string;
  idempotencyKey: string;
};
export type RentalBillPreviewItem = {
  type: RentalBillType;
  sourceKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  effectiveEnd: string | null;
  dueDate: string | null;
  amountMinor: number;
  lines: RentalBillLine[];
  disposition: "create" | "existing";
  existingBillId: string | null;
};
export type RentalBillTerminationReference = {
  periodStart: string;
  periodEnd: string;
  originalAmountMinor: number;
  referenceAmountMinor: number;
};
export type RentalBillPreview = PageResult<RentalBillPreviewItem> & {
  version: string;
  canGenerate: boolean;
  createCount: number;
  existingCount: number;
  totals: RentalBillTotals;
  createTotals: RentalBillTotals;
  missingDepositSourceKeys: string[];
  /** 整个计划的新增押金输入，不受展示分页影响；可选以兼容旧响应。 */
  depositInputs?: Array<{ sourceKey: string; label: string; amountMinor: number }>;
  terminationReference: RentalBillTerminationReference | null;
};
export type RentalBillGenerationResult = {
  generationId: string | null;
  createdCount: number;
  existingCount: number;
  totals: RentalBillTotals;
  replayed: boolean;
};
export type PreviewRentalTerminationRequest = { contractId: string; terminationDate: string };
export type RentalTerminationPreview = RentalBillTerminationReference & {
  version: string;
  affectedBillCount: number;
  requiresConfirmation: boolean;
};
