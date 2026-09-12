import { z } from "zod";

/** 租赁空间子树深度查询校验规则。 */
export const spaceSubtreeDepthSchema = z
  .object({
    propertyId: z.string().uuid(),
    id: z.string().uuid(),
  })
  .strict();

/** 返回指定空间子树相对深度的查询 DTO，由 spaceSubtreeDepthSchema 校验并转换。 */
export type SpaceSubtreeDepthDto = z.output<typeof spaceSubtreeDepthSchema>;
