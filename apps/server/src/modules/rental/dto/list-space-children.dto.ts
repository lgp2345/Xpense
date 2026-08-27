import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 租赁空间直属子节点列表查询校验规则。 */
export const listSpaceChildrenSchema = z
  .object({
    propertyId: z.string().uuid(),
    parentId: z.string().uuid().nullable().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** 租赁空间直属子节点列表查询 DTO。 */
export class ListSpaceChildrenDto extends createZodDto(listSpaceChildrenSchema) {}

/** 兼容按资源名称命名的 schema 导出。 */
export const listRentalSpaceChildrenSchema = listSpaceChildrenSchema;
export { ListSpaceChildrenDto as ListRentalSpaceChildrenDto };
