import { z } from "zod";

/** 删除分类请求校验规则。 */
export const deleteCategorySchema = z.object({ id: z.string().uuid() }).strict();

/** 删除分类请求 DTO，由 deleteCategorySchema 校验并转换。 */
export type DeleteCategoryDto = z.output<typeof deleteCategorySchema>;
