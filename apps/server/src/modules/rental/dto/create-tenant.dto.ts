import { rentalGenders, rentalIdentityDocumentTypes, rentalTenantTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { assertTenantFields } from "../tenant.rules.js";

const optionalText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().min(1).max(maxLength).optional(),
  );

// 证件号码仅把空白输入视为未填写；号码标准化统一由加密服务负责。
const optionalDocumentNumber = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().min(1).max(120).optional(),
);

const optionalCountryCode = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "国家代码必须是两位大写字母")
    .optional(),
);

/** 创建租户请求校验规则。 */
export const createTenantSchema = z
  .object({
    type: z.enum(rentalTenantTypes),
    name: z.string().trim().min(1).max(120),
    phone: optionalText(50),
    email: z.preprocess(
      (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
      z.string().trim().email().max(320).optional(),
    ),
    primaryContactName: optionalText(120),
    primaryContactPhone: optionalText(50),
    documentCountryCode: optionalCountryCode,
    documentType: z.enum(rentalIdentityDocumentTypes).optional(),
    documentTypeOtherName: optionalText(120),
    documentNumber: optionalDocumentNumber,
    birthDate: z.preprocess(
      (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
      z.iso.date().optional(),
    ),
    gender: z.enum(rentalGenders).optional(),
    ethnicity: optionalText(120),
    documentAddress: optionalText(500),
    note: optionalText(2000),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      assertTenantFields(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "租户字段不合法",
      });
    }
  });

/** 创建租户请求 DTO。 */
export class CreateTenantDto extends createZodDto(createTenantSchema) {}

/** 兼容按资源名称命名的 DTO 导出。 */
export const createRentalTenantSchema = createTenantSchema;
export { CreateTenantDto as CreateRentalTenantDto };
