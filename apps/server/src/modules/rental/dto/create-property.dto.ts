import { rentalPropertyTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const nameSchema = z.string().trim().min(1).max(120);
const optionalAreaSchema = z.string().trim().min(1).max(120).optional();
const customTypeNameSchema = z.string().trim().min(1).max(120);

/** 创建租赁房产请求校验规则。 */
export const createRentalPropertySchema = z
  .object({
    name: nameSchema,
    type: z.enum(rentalPropertyTypes),
    customTypeName: customTypeNameSchema.optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/, "国家代码必须是两位大写字母")
      .default("CN"),
    province: optionalAreaSchema,
    city: optionalAreaSchema,
    district: optionalAreaSchema,
    addressLine: z.string().trim().min(1).max(500),
    note: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === "other" && value.customTypeName === undefined) {
      context.addIssue({
        code: "custom",
        path: ["customTypeName"],
        message: "other 类型必须填写自定义类型名称",
      });
    }
    if (value.type !== "other" && value.customTypeName !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["customTypeName"],
        message: "非 other 类型不得填写自定义类型名称",
      });
    }
  });

/** 创建租赁房产请求 DTO。 */
export class CreatePropertyDto extends createZodDto(createRentalPropertySchema) {}

/** 兼容按文件名称命名的 schema 导出。 */
export const createPropertySchema = createRentalPropertySchema;
export { CreatePropertyDto as CreateRentalPropertyDto };
