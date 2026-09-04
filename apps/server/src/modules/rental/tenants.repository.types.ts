import type { RentalIdentityDocumentType, RentalTenantType } from "@xpense/shared";

/** 已归一化的租户列表筛选条件；证件号码须先在服务层转换为检索摘要。 */
export type TenantListInput = {
  keyword?: string;
  type?: RentalTenantType;
  isActive?: boolean;
  documentCountryCode?: string;
  documentType?: RentalIdentityDocumentType;
  documentNumberLookupHash?: string;
  page: number;
  pageSize: number;
};

/** 租户完整持久化记录；加密身份证载荷只可由受控服务路径解密。 */
export type RentalTenantRecord = {
  id: string;
  organizationId: string;
  type: RentalTenantType;
  name: string;
  phone: string | null;
  email: string | null;
  primaryContactName: string | null;
  primaryContactPhone: string | null;
  documentCountryCode: string | null;
  documentType: RentalIdentityDocumentType | null;
  documentTypeOtherName: string | null;
  documentNumberLookupHash: string | null;
  maskedDocumentNumber: string | null;
  sensitiveIdentityCiphertext: Buffer | null;
  sensitiveIdentityKeyVersion: number | null;
  isActive: boolean;
  note: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 不含加密身份载荷的租户列表行；合同数量由单个相关子查询提供。 */
export type RentalTenantSummaryRecord = Pick<
  RentalTenantRecord,
  | "id"
  | "type"
  | "name"
  | "phone"
  | "email"
  | "primaryContactName"
  | "primaryContactPhone"
  | "documentCountryCode"
  | "documentType"
  | "documentTypeOtherName"
  | "maskedDocumentNumber"
  | "isActive"
  | "updatedAt"
> & {
  contractCount: number;
};

/** 普通详情记录；合同数量与列表使用同一组织范围标量查询。 */
export type RentalTenantDetailRecord = RentalTenantRecord & { contractCount: number };

/** 租户分页持久化结果；服务层负责受控敏感信息映射与日期序列化。 */
export type RentalTenantPageRecord = {
  items: RentalTenantSummaryRecord[];
  total: number;
  page: number;
  pageSize: number;
};

/** 创建租户的可信持久化输入。 */
export type CreateRentalTenantInput = Omit<
  RentalTenantRecord,
  "id" | "isActive" | "deletedAt" | "deletedByUserId" | "createdAt" | "updatedAt"
> & {
  isActive?: boolean;
};

/** 更新租户完整可变持久化资料的可信输入。 */
export type UpdateRentalTenantInput = Pick<
  RentalTenantRecord,
  | "organizationId"
  | "type"
  | "name"
  | "phone"
  | "email"
  | "primaryContactName"
  | "primaryContactPhone"
  | "documentCountryCode"
  | "documentType"
  | "documentTypeOtherName"
  | "documentNumberLookupHash"
  | "maskedDocumentNumber"
  | "sensitiveIdentityCiphertext"
  | "sensitiveIdentityKeyVersion"
  | "isActive"
  | "note"
  | "updatedByUserId"
> & {
  id: string;
};

/** 设置租户启用状态的可信持久化输入。 */
export type SetRentalTenantStatusInput = {
  organizationId: string;
  id: string;
  isActive: boolean;
  updatedByUserId: string;
};

/** 软删除租户的可信持久化输入。 */
export type SoftDeleteRentalTenantInput = {
  organizationId: string;
  id: string;
  deletedByUserId: string;
  updatedByUserId: string;
};
