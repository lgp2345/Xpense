import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 租赁空间搜索查询校验规则。 */
export const searchSpacesSchema = z
  .object({
    propertyId: z.string().uuid(),
    keyword: z.string().trim().min(1).max(200),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** 租赁空间搜索查询 DTO。 */
export class SearchSpacesDto extends createZodDto(searchSpacesSchema) {}

/** 兼容按资源名称命名的 schema 导出。 */
export const searchRentalSpacesSchema = searchSpacesSchema;
export { SearchSpacesDto as SearchRentalSpacesDto };
