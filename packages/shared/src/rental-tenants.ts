import type { PageResult } from "./bookkeeping.js";

/** 租赁租户的可用类型。 */
export const rentalTenantTypes = ["individual", "company"] as const;

/** 租赁租户类型。 */
export type RentalTenantType = (typeof rentalTenantTypes)[number];

/** 租赁租户主要证件的可用类型。 */
export const rentalIdentityDocumentTypes = [
  "national_id",
  "passport",
  "residence_permit",
  "business_registration",
  "other",
] as const;

/** 租赁租户主要证件类型。 */
export type RentalIdentityDocumentType = (typeof rentalIdentityDocumentTypes)[number];

/** 租赁租户身份信息的可用性别。 */
export const rentalGenders = ["male", "female", "unspecified"] as const;

/** 租赁租户身份信息性别。 */
export type RentalGender = (typeof rentalGenders)[number];

/** 租赁租户列表和普通详情中的脱敏摘要。 */
export type RentalTenantSummary = {
  id: string;
  type: RentalTenantType;
  name: string;
  phone: string | null;
  email: string | null;
  primaryContactName: string | null;
  primaryContactPhone: string | null;
  documentCountryCode: string | null;
  documentType: RentalIdentityDocumentType | null;
  documentTypeOtherName: string | null;
  maskedDocumentNumber: string | null;
  isActive: boolean;
  contractCount: number;
  updatedAt: string;
};

/** 租赁租户普通详情，不包含完整敏感身份信息。 */
export type RentalTenantDetail = RentalTenantSummary & {
  note: string | null;
  createdAt: string;
};

/** 经单独授权和审计后返回的完整租户身份信息。 */
export type RentalTenantSensitiveDetail = {
  tenantId: string;
  documentNumber: string | null;
  birthDate: string | null;
  gender: RentalGender | null;
  ethnicity: string | null;
  documentAddress: string | null;
};

/** 租赁租户分页结果。 */
export type RentalTenantPage = PageResult<RentalTenantSummary>;

/** 租赁租户列表查询。 */
export type ListRentalTenantsQuery = Partial<{
  keyword: string;
  type: RentalTenantType;
  isActive: boolean;
  documentCountryCode: string;
  documentType: RentalIdentityDocumentType;
  documentNumber: string;
  page: number;
  pageSize: number;
}>;

/** 查询租赁租户普通详情的请求。 */
export type RentalTenantDetailQuery = {
  id: string;
};

type RentalTenantMutableFields = {
  type: RentalTenantType;
  name: string;
  phone: string | null;
  email: string | null;
  primaryContactName: string | null;
  primaryContactPhone: string | null;
  documentCountryCode: string | null;
  documentType: RentalIdentityDocumentType | null;
  documentTypeOtherName: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  gender: RentalGender | null;
  ethnicity: string | null;
  documentAddress: string | null;
  note: string | null;
};

type AtLeastOne<T, Key extends keyof T = keyof T> = Key extends keyof T
  ? Required<Pick<T, Key>> & Partial<Omit<T, Key>>
  : never;

/** 创建租赁租户的请求。 */
export type CreateRentalTenantRequest = {
  type: RentalTenantType;
  name: string;
} & Partial<RentalTenantMutableFields>;

/** 更新租赁租户资料的请求；启停由独立请求维护。 */
export type UpdateRentalTenantRequest = { id: string } & AtLeastOne<RentalTenantMutableFields>;

/** 设置租赁租户状态的请求。 */
export type SetRentalTenantStatusRequest = {
  id: string;
  isActive: boolean;
};

/** 删除租赁租户的请求。 */
export type DeleteRentalTenantRequest = {
  id: string;
};

/** 查看完整租赁租户身份信息的请求。 */
export type RevealRentalTenantSensitiveRequest = {
  id: string;
};
