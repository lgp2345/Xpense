import { rentalSpaceTypes } from "@xpense/shared";
import { z } from "zod";

const nameSchema = z.string().trim().min(1).max(120);
const codeSchema = z.string().trim().min(1).max(120);
const customTypeNameSchema = z.string().trim().min(1).max(120);
const sortOrderSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647);
const noteSchema = z.string().trim().min(1).max(2000);

/** 创建租赁空间请求校验规则。 */
export const createRentalSpaceSchema = z
  .object({
    propertyId: z.string().uuid(),
    parentId: z.string().uuid().optional(),
    name: nameSchema,
    code: codeSchema.optional(),
    type: z.enum(rentalSpaceTypes),
    customTypeName: customTypeNameSchema.optional(),
    isRentable: z.boolean(),
    sortOrder: sortOrderSchema.optional(),
    note: noteSchema.optional(),
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

/** 创建租赁空间请求 DTO，由 createRentalSpaceSchema 校验并转换。 */
export type CreateSpaceDto = z.output<typeof createRentalSpaceSchema>;

/** 兼容按文件名称命名的 schema 导出。 */
export const createSpaceSchema = createRentalSpaceSchema;
export type { CreateSpaceDto as CreateRentalSpaceDto };
