import { categoryTypes } from "@xpense/shared";
import { z } from "zod";

const iconSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/, "图标必须是有效的图标标识")
  .nullable();
const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是六位十六进制色值")
  .nullable();
const sortOrderSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647);

/** 更新分类请求校验规则。 */
export const updateCategorySchema = z
  .object({
    id: z.string().uuid(),
    ledgerId: z.string().uuid().optional(),
    type: z.enum(categoryTypes).optional(),
    parentId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    icon: iconSchema.optional(),
    color: colorSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.ledgerId !== undefined ||
      value.type !== undefined ||
      value.parentId !== undefined ||
      value.name !== undefined ||
      value.icon !== undefined ||
      value.color !== undefined ||
      value.sortOrder !== undefined,
    { message: "至少需要提供一项分类信息" },
  );

/** 更新分类请求 DTO，由 updateCategorySchema 校验并转换。 */
export type UpdateCategoryDto = z.output<typeof updateCategorySchema>;
