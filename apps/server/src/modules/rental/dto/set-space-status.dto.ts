import { z } from "zod";

/** 设置租赁空间状态请求校验规则。 */
export const setSpaceStatusSchema = z
  .object({ id: z.string().uuid(), isActive: z.boolean() })
  .strict();

/** 设置租赁空间状态请求 DTO，由 setSpaceStatusSchema 校验并转换。 */
export type SetSpaceStatusDto = z.output<typeof setSpaceStatusSchema>;

/** 兼容按资源名称命名的 DTO 导出。 */
export const setRentalSpaceStatusSchema = setSpaceStatusSchema;
export type { SetSpaceStatusDto as SetRentalSpaceStatusDto };
