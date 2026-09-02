import type { RentalGender, RentalIdentityDocumentType } from "@xpense/shared";

/** 仅在加密边界内使用的租户敏感身份资料。 */
export type RentalSensitiveIdentity = {
  documentNumber: string | null;
  birthDate: string | null;
  gender: RentalGender | null;
  ethnicity: string | null;
  documentAddress: string | null;
};

/** 用于组织作用域内证件检索摘要的非敏感证件定位输入。 */
export type RentalTenantDocumentIdentity = {
  countryCode: string;
  type: RentalIdentityDocumentType;
  documentNumber: string;
};
