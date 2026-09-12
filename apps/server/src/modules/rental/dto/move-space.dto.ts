import { z } from "zod";

const sortOrderSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647);

/** 移动租赁空间请求校验规则。 */
export const moveRentalSpaceSchema = z
  .object({
    id: z.string().uuid(),
    parentId: z.string().uuid().nullable().optional(),
    sortOrder: sortOrderSchema,
  })
  .strict();

/** 移动租赁空间请求 DTO，由 moveRentalSpaceSchema 校验并转换。 */
export type MoveSpaceDto = z.output<typeof moveRentalSpaceSchema>;

/** 兼容按动作名称命名的 schema 导出。 */
export const moveSpaceSchema = moveRentalSpaceSchema;
