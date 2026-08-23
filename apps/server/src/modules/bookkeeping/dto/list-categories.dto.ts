import { categoryTypes } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 分类列表查询校验规则。 */
export const listCategoriesSchema = z
  .object({
    ledgerId: z.string().uuid(),
    type: z.enum(categoryTypes).optional(),
  })
  .strict();

/** 分类列表查询 DTO。 */
export class ListCategoriesDto extends createZodDto(listCategoriesSchema) {}
