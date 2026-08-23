import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 删除分类请求校验规则。 */
export const deleteCategorySchema = z.object({ id: z.string().uuid() }).strict();

/** 删除分类请求 DTO。 */
export class DeleteCategoryDto extends createZodDto(deleteCategorySchema) {}
