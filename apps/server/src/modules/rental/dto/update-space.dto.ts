import { rentalSpaceTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const nameSchema = z.string().trim().min(1).max(120);
const codeSchema = z.string().trim().min(1).max(120).nullable().optional();
const customTypeNameSchema = z.string().trim().min(1).max(120).nullable().optional();
const sortOrderSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647);

/** 更新租赁空间请求校验规则。状态和父节点由独立流程维护。 */
export const updateRentalSpaceSchema = z
  .object({
    id: z.string().uuid(),
    name: nameSchema.optional(),
    code: codeSchema,
    type: z.enum(rentalSpaceTypes).optional(),
    customTypeName: customTypeNameSchema,
    isRentable: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "id"), "至少需要提供一项空间信息")
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

/** 更新租赁空间请求 DTO。 */
export class UpdateSpaceDto extends createZodDto(updateRentalSpaceSchema) {}

/** 兼容按资源名称命名的 schema 导出。 */
export const updateSpaceSchema = updateRentalSpaceSchema;
export { UpdateSpaceDto as UpdateRentalSpaceDto };
