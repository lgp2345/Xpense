import { rentalSpaceTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const itemNameSchema = z.string().trim().min(1).max(120);
const itemCodeSchema = z.string().trim().min(1).max(120);
const customTypeNameSchema = z.string().trim().min(1).max(120);
const sortOrderSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647);
const noteSchema = z.string().trim().min(1).max(2000);

const batchItemSchema = z
  .object({
    name: itemNameSchema,
    code: itemCodeSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict();

/** 批量创建租赁空间请求校验规则。 */
export const batchCreateRentalSpacesSchema = z
  .object({
    propertyId: z.string().uuid(),
    parentId: z.string().uuid().optional(),
    type: z.enum(rentalSpaceTypes),
    customTypeName: customTypeNameSchema.optional(),
    isRentable: z.boolean(),
    note: noteSchema.optional(),
    items: z.array(batchItemSchema).min(1).max(500),
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

/** 批量创建租赁空间请求 DTO。 */
export class BatchCreateSpacesDto extends createZodDto(batchCreateRentalSpacesSchema) {}

/** 兼容按动作名称命名的 schema 导出。 */
export const batchCreateSpacesSchema = batchCreateRentalSpacesSchema;
export { BatchCreateSpacesDto as BatchCreateRentalSpacesDto };
