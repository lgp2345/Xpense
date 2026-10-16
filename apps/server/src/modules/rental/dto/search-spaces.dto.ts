import { z } from "zod";

/** 租赁空间搜索查询校验规则。 */
export const searchSpacesSchema = z
  .object({
    propertyId: z.string().uuid(),
    keyword: z.string().trim().max(200).default(""),
    isEffectivelyActive: z
      .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
      .optional(),
    leaseStatus: z.enum(["vacant", "upcoming", "active", "expiring_soon"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** 租赁空间搜索查询 DTO，由 searchSpacesSchema 校验并转换。 */
export type SearchSpacesDto = z.output<typeof searchSpacesSchema>;

/** 兼容按资源名称命名的 schema 导出。 */
export const searchRentalSpacesSchema = searchSpacesSchema;
export type { SearchSpacesDto as SearchRentalSpacesDto };
