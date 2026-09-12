import { rentalGenders, rentalIdentityDocumentTypes, rentalTenantTypes } from "@xpense/shared";
import { z } from "zod";

const optionalNullableText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().min(1).max(maxLength).nullable().optional(),
  );

const optionalText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().min(1).max(maxLength).optional(),
  );

// 号码格式由 TenantIdentityCryptoService 统一处理，DTO 仅将空白输入转为 undefined。
const optionalNullableDocumentNumber = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().min(1).max(120).nullable().optional(),
);

const optionalNullableCountryCode = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "国家代码必须是两位大写字母")
    .nullable()
    .optional(),
);

/** 更新租户请求校验规则；字段组合由完整快照合并后校验。 */
export const updateTenantSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(rentalTenantTypes).optional(),
    name: optionalText(120),
    phone: optionalNullableText(50),
    email: z.preprocess(
      (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
      z.string().trim().email().max(320).nullable().optional(),
    ),
    primaryContactName: optionalNullableText(120),
    primaryContactPhone: optionalNullableText(50),
    documentCountryCode: optionalNullableCountryCode,
    documentType: z.enum(rentalIdentityDocumentTypes).nullable().optional(),
    documentTypeOtherName: optionalNullableText(120),
    documentNumber: optionalNullableDocumentNumber,
    birthDate: z.preprocess(
      (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
      z.iso.date().nullable().optional(),
    ),
    gender: z.enum(rentalGenders).nullable().optional(),
    ethnicity: optionalNullableText(120),
    documentAddress: optionalNullableText(500),
    note: optionalNullableText(2000),
  })
  .strict()
  .refine(
    (value) =>
      Object.entries(value).some(([key, fieldValue]) => key !== "id" && fieldValue !== undefined),
    "至少需要提供一项租户信息",
  );

/** 更新租户请求 DTO，由 updateTenantSchema 校验并转换。 */
export type UpdateTenantDto = z.output<typeof updateTenantSchema>;

/** 兼容按资源名称命名的 DTO 导出。 */
export const updateRentalTenantSchema = updateTenantSchema;
export type { UpdateTenantDto as UpdateRentalTenantDto };
