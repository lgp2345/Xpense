import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 设置租赁空间状态请求校验规则。 */
export const setSpaceStatusSchema = z
  .object({ id: z.string().uuid(), isActive: z.boolean() })
  .strict();

/** 设置租赁空间状态请求 DTO。 */
export class SetSpaceStatusDto extends createZodDto(setSpaceStatusSchema) {}

/** 兼容按资源名称命名的 DTO 导出。 */
export const setRentalSpaceStatusSchema = setSpaceStatusSchema;
export { SetSpaceStatusDto as SetRentalSpaceStatusDto };
