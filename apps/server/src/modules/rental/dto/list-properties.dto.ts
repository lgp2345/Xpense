import { rentalPropertyTypes } from "@xpense/shared";
import { z } from "zod";

const queryBoolean = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((value) => value === "true"),
]);

/** 租赁房产列表查询校验规则。 */
export const listPropertiesSchema = z
  .object({
    keyword: z.string().trim().min(1).max(200).optional(),
    type: z.enum(rentalPropertyTypes).optional(),
    isActive: queryBoolean.optional(),
    province: z.string().trim().min(1).max(120).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    district: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** 租赁房产列表查询 DTO，由 listPropertiesSchema 校验并转换。 */
export type ListPropertiesDto = z.output<typeof listPropertiesSchema>;

/** 兼容按复数资源名称命名的 schema 导出。 */
export const listRentalPropertiesSchema = listPropertiesSchema;
export type { ListPropertiesDto as ListRentalPropertiesDto };
