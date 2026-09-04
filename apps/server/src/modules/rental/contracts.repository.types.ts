import type {
  RentalBillingAnchor,
  RentalContractDisplayStatus,
  RentalContractLifecycleStatus,
  RentalDepositCalculationMode,
  RentalDepositType,
  RentalIdentityDocumentType,
  RentalTenantType,
} from "@xpense/shared";

/** 已归一化的合同列表筛选条件。 */
export type ContractListInput = {
  keyword?: string;
  propertyId?: string;
  tenantId?: string;
  status?: RentalContractDisplayStatus;
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  page: number;
  pageSize: number;
};

/** 合同头完整持久化记录。 */
export type RentalContractRecord = {
  id: string;
  organizationId: string;
  propertyId: string;
  contractNumber: string;
  externalContractNumber: string | null;
  status: RentalContractLifecycleStatus;
  startDate: string | null;
  endDate: string | null;
  rentAmountMinor: number | null;
  billingAnchor: RentalBillingAnchor | null;
  paymentIntervalMonths: number | null;
  dueDaysBefore: number | null;
  renewedFromContractId: string | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  terminationDate: string | null;
  terminationRecordedAt: Date | null;
  terminatedByUserId: string | null;
  terminationReason: string | null;
  note: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 合同列表持久化摘要；展示状态基于组织本地日期在查询时派生。 */
export type RentalContractSummaryRecord = Pick<
  RentalContractRecord,
  | "id"
  | "propertyId"
  | "contractNumber"
  | "externalContractNumber"
  | "startDate"
  | "endDate"
  | "rentAmountMinor"
  | "updatedAt"
> & {
  propertyName: string;
  lifecycleStatus: RentalContractLifecycleStatus;
  displayStatus: RentalContractDisplayStatus;
  actualEndDate: string | null;
  tenantNames: string[];
  spaceNames: string[];
};

/** 合同空间快照的持久化详情。 */
export type RentalContractSpaceRecord = {
  spaceId: string;
  spaceName: string;
  spaceCode: string | null;
  spacePath: Array<{ id: string; name: string }>;
  rentAllocationMinor: number | null;
};

/** 合同承租方快照的持久化详情；不包含受控身份密文。 */
export type RentalContractPartyPeriodRecord = {
  tenantId: string;
  tenantType: RentalTenantType;
  tenantName: string;
  phone: string | null;
  email: string | null;
  primaryContactName: string | null;
  primaryContactPhone: string | null;
  documentCountryCode: string | null;
  documentType: RentalIdentityDocumentType | null;
  documentTypeOtherName: string | null;
  maskedDocumentNumber: string | null;
  validFrom: string | null;
  validTo: string | null;
  isPrimaryPayer: boolean;
};

/** 合同押金持久化详情。 */
export type RentalContractDepositRecord = {
  id: string;
  type: RentalDepositType;
  customName: string | null;
  calculationMode: RentalDepositCalculationMode;
  fixedAmountMinor: number | null;
  rentMultiple: string | null;
  finalAmountMinor: number | null;
  sortOrder: number;
};

/** 合同聚合详情持久化结果。 */
export type RentalContractDetailRecord = RentalContractSummaryRecord &
  Pick<
    RentalContractRecord,
    | "billingAnchor"
    | "paymentIntervalMonths"
    | "dueDaysBefore"
    | "renewedFromContractId"
    | "cancellationReason"
    | "terminationDate"
    | "terminationReason"
    | "note"
    | "createdAt"
  > & {
    hasScheduledTermination: boolean;
    spaces: RentalContractSpaceRecord[];
    parties: RentalContractPartyPeriodRecord[];
    depositTerms: RentalContractDepositRecord[];
  };

/** 合同分页持久化结果。 */
export type RentalContractPageRecord = {
  items: RentalContractSummaryRecord[];
  total: number;
  page: number;
  pageSize: number;
};

/** 创建草稿合同头的可信输入。 */
export type CreateDraftContractInput = Pick<
  RentalContractRecord,
  | "organizationId"
  | "propertyId"
  | "contractNumber"
  | "externalContractNumber"
  | "startDate"
  | "endDate"
  | "rentAmountMinor"
  | "billingAnchor"
  | "paymentIntervalMonths"
  | "dueDaysBefore"
  | "renewedFromContractId"
  | "note"
  | "createdByUserId"
  | "updatedByUserId"
>;

/** 更新合同头全部可变资料的可信输入。 */
export type UpdateContractHeaderInput = Pick<
  RentalContractRecord,
  | "organizationId"
  | "propertyId"
  | "externalContractNumber"
  | "startDate"
  | "endDate"
  | "rentAmountMinor"
  | "billingAnchor"
  | "paymentIntervalMonths"
  | "dueDaysBefore"
  | "note"
  | "updatedByUserId"
> & { id: string };

/** 设置合同生命周期及对应审计字段的可信输入。 */
export type SetContractLifecycleInput = {
  organizationId: string;
  id: string;
  status: RentalContractLifecycleStatus;
  updatedByUserId: string;
  cancelledAt?: Date | null;
  cancelledByUserId?: string | null;
  cancellationReason?: string | null;
  terminationDate?: string | null;
  terminationRecordedAt?: Date | null;
  terminatedByUserId?: string | null;
  terminationReason?: string | null;
  expectedStatus?: RentalContractLifecycleStatus;
};

/** 软删除草稿合同的可信输入。 */
export type SoftDeleteContractInput = {
  organizationId: string;
  id: string;
  deletedByUserId: string;
  updatedByUserId: string;
};

export type ContractPartyReference = { tenantId: string; isPrimaryPayer: boolean };
export type ContractSpaceReference = { spaceId: string; rentAllocationMinor?: number };
export type ContractDepositReference = {
  type: RentalDepositType;
  customName: string | null;
  calculationMode: RentalDepositCalculationMode;
  fixedAmountMinor: number | null;
  rentMultiple: string | null;
  sortOrder: number;
};

export type ReplaceDraftSpacesInput = {
  organizationId: string;
  contractId: string;
  propertyId: string;
  spaces: ContractSpaceReference[];
};
export type ReplaceDraftPartiesInput = {
  organizationId: string;
  contractId: string;
  parties: ContractPartyReference[];
};
export type ReplaceDraftDepositsInput = {
  organizationId: string;
  contractId: string;
  deposits: ContractDepositReference[];
};
export type ConfirmContractSnapshotsInput = { organizationId: string; contractId: string };
/** 读取已确认历史承租方身份快照的严格作用域。 */
export type FindContractPartySensitiveSnapshotInput = ConfirmContractSnapshotsInput & {
  tenantId: string;
  validFrom: string;
};
export type ReplaceContractPartyPeriodsInput = ConfirmContractSnapshotsInput & {
  effectiveDate: string;
  parties: ContractPartyReference[];
};
export type AppendContractChangeInput = ConfirmContractSnapshotsInput & {
  type: "parties_changed";
  effectiveDate: string;
  reason: string;
  beforePartyRefs: ContractPartyReference[];
  afterPartyRefs: ContractPartyReference[];
  createdByUserId: string;
};

export type AppendTerminationRevocationInput = {
  organizationId: string;
  contractId: string;
  reason: string;
  terminationDateBeforeRevoke: string;
  createdByUserId: string;
};

export type ClipContractPartyPeriodsInput = ConfirmContractSnapshotsInput & {
  actualEnd: string;
};

export type RestoreContractPartyPeriodsInput = ConfirmContractSnapshotsInput & {
  terminatedAt: string;
  originalEnd: string;
};

export type CopyTerminalPartySetInput = ConfirmContractSnapshotsInput & {
  targetContractId: string;
  validFrom: string;
  validTo: string;
};

/** 空间冲突查询的严格作用域和闭区间输入。 */
export type ContractSpaceConflictInput = {
  organizationId: string;
  propertyId: string;
  spaceIds: string[];
  startDate: string;
  endDate: string;
  excludeContractId?: string;
};

/** 不含承租方资料的安全冲突行。 */
export type RentalContractSpaceConflictRecord = {
  contractId: string;
  contractNumber: string;
  spaceId: string;
};

/** 合同引用保护仅返回关系分类，不包含合同正文或承租方资料。 */
export type ContractReferenceSummary = {
  own: boolean;
  descendant: boolean;
  oldAncestor: boolean;
  newAncestor: boolean;
};

export type ContractReferenceQueryInput = {
  organizationId: string;
  propertyId: string;
  today: string;
  ownSpaceIds?: string[];
  descendantSpaceIds?: string[];
  oldAncestorSpaceIds?: string[];
  newAncestorSpaceIds?: string[];
};

export type PropertyContractCounts = {
  activeContractCount: number;
  upcomingContractCount: number;
  expiringSoonContractCount: number;
};

/** 仅供受控授权服务解密的合同承租方身份快照载荷。 */
export type RentalContractPartySensitiveSnapshotRecord = {
  contractId: string;
  tenantId: string;
  validFrom: string | null;
  validTo: string | null;
  identitySnapshotCiphertext: Buffer | null;
  identitySnapshotKeyVersion: number | null;
};
