import { categoryTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const iconSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/, "图标必须是有效的图标标识");
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是六位十六进制色值");
const sortOrderSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647);

/** 创建分类请求校验规则。 */
export const createCategorySchema = z
  .object({
    ledgerId: z.string().uuid(),
    type: z.enum(categoryTypes),
    parentId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(120),
    icon: iconSchema.optional(),
    color: colorSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict();

/** 创建分类请求 DTO。 */
export class CreateCategoryDto extends createZodDto(createCategorySchema) {}
