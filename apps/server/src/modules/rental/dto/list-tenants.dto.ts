import { rentalIdentityDocumentTypes, rentalTenantTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const queryBoolean = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((value) => value === "true"),
]);

const optionalQueryText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().min(1).max(maxLength).optional(),
  );

const optionalQueryDocumentNumber = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().min(1).max(120).optional(),
);

const optionalQueryCountryCode = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "国家代码必须是两位大写字母")
    .optional(),
);

/** 租户列表查询校验规则。 */
export const listTenantsSchema = z
  .object({
    keyword: optionalQueryText(200),
    type: z.enum(rentalTenantTypes).optional(),
    isActive: queryBoolean.optional(),
    documentCountryCode: optionalQueryCountryCode,
    documentType: z.enum(rentalIdentityDocumentTypes).optional(),
    documentNumber: optionalQueryDocumentNumber,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** 租户列表查询 DTO。 */
export class ListTenantsDto extends createZodDto(listTenantsSchema) {}

/** 兼容按资源名称命名的 DTO 导出。 */
export const listRentalTenantsSchema = listTenantsSchema;
export { ListTenantsDto as ListRentalTenantsDto };
