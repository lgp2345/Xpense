import { rentalPropertyTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const nameSchema = z.string().trim().min(1).max(120);
const optionalAreaSchema = z.string().trim().min(1).max(120).nullable().optional();
const customTypeNameSchema = z.string().trim().min(1).max(120).nullable().optional();

/** 更新租赁房产请求校验规则。状态和账本由独立流程维护。 */
export const updateRentalPropertySchema = z
  .object({
    id: z.string().uuid(),
    name: nameSchema.optional(),
    type: z.enum(rentalPropertyTypes).optional(),
    customTypeName: customTypeNameSchema,
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/, "国家代码必须是两位大写字母")
      .optional(),
    province: optionalAreaSchema,
    city: optionalAreaSchema,
    district: optionalAreaSchema,
    addressLine: z.string().trim().min(1).max(500).optional(),
    note: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "id"), "至少需要提供一项房产信息")
  .superRefine((value, context) => {
    if (value.type === undefined) return;
    const hasName = value.customTypeName !== undefined;
    if (value.type === "other" && (!hasName || value.customTypeName === null)) {
      context.addIssue({
        code: "custom",
        path: ["customTypeName"],
        message: "other 类型必须填写自定义类型名称",
      });
    }
    if (value.type !== "other" && hasName && value.customTypeName !== null) {
      context.addIssue({
        code: "custom",
        path: ["customTypeName"],
        message: "非 other 类型不得填写自定义类型名称",
      });
    }
  });

/** 更新租赁房产请求 DTO。 */
export class UpdatePropertyDto extends createZodDto(updateRentalPropertySchema) {}

/** 兼容按资源名称命名的 schema 导出。 */
export const updatePropertySchema = updateRentalPropertySchema;
