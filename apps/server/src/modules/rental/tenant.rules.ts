import type { RentalGender, RentalIdentityDocumentType, RentalTenantType } from "@xpense/shared";

import type { RentalSensitiveIdentity } from "./tenant-identity.types.js";

/** 租户主档可由创建、更新流程维护的字段快照。 */
export type RentalTenantMutableValues = {
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

type TenantFieldsInput = Partial<RentalTenantMutableValues>;

const rentalTenantMutableFields = [
  "type",
  "name",
  "phone",
  "email",
  "primaryContactName",
  "primaryContactPhone",
  "documentCountryCode",
  "documentType",
  "documentTypeOtherName",
  "documentNumber",
  "birthDate",
  "gender",
  "ethnicity",
  "documentAddress",
  "note",
] as const satisfies readonly (keyof RentalTenantMutableValues)[];

/** 判断字段是否带有可持久化的值。 */
function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined;
}

/** 校验租户类型、证件和敏感身份字段的组合关系。 */
export function assertTenantFields(input: TenantFieldsInput): void {
  if (input.type === "company") {
    if (!hasValue(input.primaryContactName) || !hasValue(input.primaryContactPhone)) {
      throw new Error("企业租户必须填写联系人姓名和联系人电话");
    }
    for (const field of ["birthDate", "gender", "ethnicity", "documentAddress"] as const) {
      if (hasValue(input[field])) {
        throw new Error("企业租户不得填写个人身份字段");
      }
    }
    if (
      input.documentType !== undefined &&
      input.documentType !== null &&
      input.documentType !== "business_registration" &&
      input.documentType !== "other"
    ) {
      throw new Error("企业租户仅可填写营业执照或其他证件");
    }
  }

  if (input.type === "individual") {
    if (input.documentType === "business_registration") {
      throw new Error("个人租户不得填写营业执照");
    }
  }

  const documentFields = [input.documentCountryCode, input.documentType, input.documentNumber];
  const documentFieldCount = documentFields.filter(hasValue).length;
  if (documentFieldCount !== 0 && documentFieldCount !== documentFields.length) {
    throw new Error("证件国家、类型和号码必须同时填写或同时留空");
  }

  if (input.documentType === "other") {
    if (!hasValue(input.documentTypeOtherName)) {
      throw new Error("other 证件类型必须填写证件名称");
    }
  } else if (hasValue(input.documentTypeOtherName)) {
    throw new Error("非 other 证件类型不得填写证件名称");
  }

  if (hasValue(input.ethnicity) && input.documentCountryCode !== "CN") {
    throw new Error("民族仅可随中国证件填写");
  }
}

/** 合并租户部分更新，并以完整快照校验字段关系。 */
export function mergeTenantUpdate(
  current: RentalTenantMutableValues,
  update: Partial<RentalTenantMutableValues>,
): RentalTenantMutableValues {
  const currentValues = Object.fromEntries(
    rentalTenantMutableFields.map((field) => [field, current[field]]),
  ) as RentalTenantMutableValues;
  const definedUpdates = Object.fromEntries(
    rentalTenantMutableFields.flatMap((field) => {
      const value = update[field];
      return value === undefined ? [] : [[field, value]];
    }),
  ) as Partial<RentalTenantMutableValues>;
  const merged = { ...currentValues, ...definedUpdates };
  assertTenantFields(merged);
  return merged;
}

/** 提取用于加密持久化的敏感身份资料；无任何资料时不生成载荷。 */
export function toSensitiveIdentity(input: TenantFieldsInput): RentalSensitiveIdentity | null {
  const fields = [
    input.documentNumber,
    input.birthDate,
    input.gender,
    input.ethnicity,
    input.documentAddress,
  ];
  if (!fields.some(hasValue)) return null;

  return {
    documentNumber: input.documentNumber ?? null,
    birthDate: input.birthDate ?? null,
    gender: input.gender ?? null,
    ethnicity: input.ethnicity ?? null,
    documentAddress: input.documentAddress ?? null,
  };
}
