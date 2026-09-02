import type { PageResult } from "./bookkeeping.js";
import type {
  RentalGender,
  RentalIdentityDocumentType,
  RentalTenantType,
} from "./rental-tenants.js";

/** 租赁合同持久化生命周期状态。 */
export const rentalContractLifecycleStatuses = [
  "draft",
  "confirmed",
  "cancelled",
  "terminated",
] as const;

/** 租赁合同持久化生命周期状态。 */
export type RentalContractLifecycleStatus = (typeof rentalContractLifecycleStatuses)[number];

/** 租赁合同面向页面的派生展示状态。 */
export const rentalContractDisplayStatuses = [
  "draft",
  "upcoming",
  "active",
  "expiring_soon",
  "expired",
  "cancelled",
  "terminated",
] as const;

/** 租赁合同面向页面的派生展示状态。 */
export type RentalContractDisplayStatus = (typeof rentalContractDisplayStatuses)[number];

/** 租赁合同计费锚点。 */
export const rentalBillingAnchors = ["contract_start", "calendar_month"] as const;

/** 租赁合同计费锚点。 */
export type RentalBillingAnchor = (typeof rentalBillingAnchors)[number];

/** 租赁合同押金项目类型。 */
export const rentalDepositTypes = ["rental", "utility", "access_card", "other"] as const;

/** 租赁合同押金项目类型。 */
export type RentalDepositType = (typeof rentalDepositTypes)[number];

/** 租赁合同押金计算方式。 */
export const rentalDepositCalculationModes = ["fixed_amount", "rent_multiple"] as const;

/** 租赁合同押金计算方式。 */
export type RentalDepositCalculationMode = (typeof rentalDepositCalculationModes)[number];

/** 空间自身的派生租赁状态。 */
export const rentalLeaseStatuses = ["vacant", "upcoming", "active", "expiring_soon"] as const;

/** 空间自身的派生租赁状态。 */
export type RentalLeaseStatus = (typeof rentalLeaseStatuses)[number];

/** 空间因祖先或后代合同而不可出租的原因。 */
export const rentalLeaseBlockedReasons = ["ancestor_contract", "descendant_contract"] as const;

/** 空间因祖先或后代合同而不可出租的原因。 */
export type RentalLeaseBlockedReason = (typeof rentalLeaseBlockedReasons)[number];

/** 租赁合同可选的付款周期（月）。 */
export type RentalPaymentIntervalMonths = 1 | 3 | 6 | 12;

/** 租赁合同空间路径中的单个节点。 */
export type RentalContractSpacePathNode = {
  id: string;
  name: string;
};

/** 租赁合同空间关联的快照。 */
export type RentalContractSpace = {
  spaceId: string;
  spaceName: string;
  spaceCode: string | null;
  spacePath: RentalContractSpacePathNode[];
  rentAllocationMinor: number | null;
};

/** 租赁合同承租方的有效期快照。 */
export type RentalContractParty = {
  tenantId: string;
  type: RentalTenantType;
  name: string;
  phone: string | null;
  email: string | null;
  primaryContactName: string | null;
  documentCountryCode: string | null;
  documentType: RentalIdentityDocumentType | null;
  documentTypeOtherName: string | null;
  maskedDocumentNumber: string | null;
  validFrom: string | null;
  validTo: string | null;
  isPrimaryPayer: boolean;
};

/** 租赁合同押金约定。 */
export type RentalContractDepositTerm = {
  id: string;
  type: RentalDepositType;
  customName: string | null;
  calculationMode: RentalDepositCalculationMode;
  fixedAmountMinor: number | null;
  rentMultiple: string | null;
  finalAmountMinor: number | null;
  sortOrder: number;
};

/** 租赁合同列表摘要。 */
export type RentalContractSummary = {
  id: string;
  propertyId: string;
  propertyName: string;
  contractNumber: string;
  externalContractNumber: string | null;
  lifecycleStatus: RentalContractLifecycleStatus;
  displayStatus: RentalContractDisplayStatus;
  startDate: string | null;
  endDate: string | null;
  actualEndDate: string | null;
  rentAmountMinor: number | null;
  tenantNames: string[];
  spaceNames: string[];
  updatedAt: string;
};

/** 租赁合同详情。 */
export type RentalContractDetail = RentalContractSummary & {
  billingAnchor: RentalBillingAnchor | null;
  paymentIntervalMonths: RentalPaymentIntervalMonths | null;
  dueDaysBefore: number | null;
  hasScheduledTermination: boolean;
  renewedFromContractId: string | null;
  cancellationReason: string | null;
  terminationDate: string | null;
  terminationReason: string | null;
  note: string | null;
  spaces: RentalContractSpace[];
  parties: RentalContractParty[];
  depositTerms: RentalContractDepositTerm[];
  createdAt: string;
};

/** 租赁合同分页结果。 */
export type RentalContractPage = PageResult<RentalContractSummary>;

/** 空间可用性冲突的安全展示摘要。 */
export type RentalContractAvailabilityConflict = {
  contractId: string;
  contractNumber: string;
  spaceId: string;
  spaceName: string;
};

/** 租赁合同空间可用性检查结果。 */
export type RentalContractAvailability = {
  available: boolean;
  conflicts: RentalContractAvailabilityConflict[];
};

/** 经单独授权和审计后返回的合同历史承租方身份快照。 */
export type RentalContractPartySensitiveDetail = {
  contractId: string;
  tenantId: string;
  validFrom: string;
  validTo: string;
  documentNumber: string | null;
  birthDate: string | null;
  gender: RentalGender | null;
  ethnicity: string | null;
  documentAddress: string | null;
};

/** 租赁合同列表查询。 */
export type ListRentalContractsQuery = Partial<{
  keyword: string;
  propertyId: string;
  tenantId: string;
  status: RentalContractDisplayStatus;
  startDateFrom: string;
  startDateTo: string;
  endDateFrom: string;
  endDateTo: string;
  page: number;
  pageSize: number;
}>;

/** 查询租赁合同详情的请求。 */
export type RentalContractDetailQuery = {
  id: string;
};

/** 租赁合同承租方关系输入。 */
export type RentalContractPartyInput = {
  tenantId: string;
  isPrimaryPayer: boolean;
};

/** 租赁合同空间关系输入。 */
export type RentalContractSpaceInput = {
  spaceId: string;
  rentAllocationMinor?: number;
};

/** 租赁合同押金约定输入。 */
export type RentalContractDepositTermInput = {
  type: RentalDepositType;
  customName?: string;
  calculationMode: RentalDepositCalculationMode;
  fixedAmountMinor?: number;
  rentMultiple?: string;
  sortOrder?: number;
};

type RentalContractMutableFields = {
  propertyId: string;
  externalContractNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  rentAmountMinor: number | null;
  billingAnchor: RentalBillingAnchor | null;
  paymentIntervalMonths: RentalPaymentIntervalMonths | null;
  dueDaysBefore: number | null;
  parties: RentalContractPartyInput[];
  spaces: RentalContractSpaceInput[];
  depositTerms: RentalContractDepositTermInput[];
  note: string | null;
};

type AtLeastOne<T, Key extends keyof T = keyof T> = Key extends keyof T
  ? Required<Pick<T, Key>> & Partial<Omit<T, Key>>
  : never;

/** 创建租赁合同草稿的请求。 */
export type CreateRentalContractRequest = {
  propertyId: string;
} & Partial<Omit<RentalContractMutableFields, "propertyId">>;

/** 更新租赁合同资料的请求。 */
export type UpdateRentalContractRequest = { id: string } & AtLeastOne<RentalContractMutableFields>;

/** 检查租赁合同空间可用性的请求。 */
export type CheckRentalContractAvailabilityRequest = {
  propertyId: string;
  spaceIds: string[];
  startDate: string;
  endDate: string;
  excludeContractId?: string;
};

/** 确认租赁合同的请求。 */
export type ConfirmRentalContractRequest = {
  id: string;
};

/** 取消尚未开始租赁合同的请求。 */
export type CancelRentalContractRequest = {
  id: string;
  reason: string;
};

/** 变更已开始租赁合同承租方的请求。 */
export type ChangeRentalContractPartiesRequest = {
  id: string;
  effectiveDate: string;
  reason: string;
  parties: RentalContractPartyInput[];
};

/** 提前终止租赁合同的请求。 */
export type TerminateRentalContractRequest = {
  id: string;
  terminationDate: string;
  reason: string;
};

/** 撤销未来生效租赁合同终止的请求。 */
export type RevokeRentalContractTerminationRequest = {
  id: string;
  reason: string;
};

/** 查看合同历史承租方完整身份信息的请求。 */
export type RevealRentalContractPartySensitiveRequest = {
  contractId: string;
  tenantId: string;
  validFrom: string;
};

/** 基于既有租赁合同创建续租草稿的请求。 */
export type RenewRentalContractRequest = {
  id: string;
};

/** 删除租赁合同草稿的请求。 */
export type DeleteRentalContractRequest = {
  id: string;
};
