import { categoryTypes } from "@xpense/shared";
import { z } from "zod";

/** 分类列表查询校验规则。 */
export const listCategoriesSchema = z
  .object({
    ledgerId: z.string().uuid(),
    type: z.enum(categoryTypes).optional(),
  })
  .strict();

/** 分类列表查询 DTO，由 listCategoriesSchema 校验并转换。 */
export type ListCategoriesDto = z.output<typeof listCategoriesSchema>;
