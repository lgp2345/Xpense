import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 设置租赁房产状态请求校验规则。 */
export const setPropertyStatusSchema = z
  .object({ id: z.string().uuid(), isActive: z.boolean() })
  .strict();

/** 设置租赁房产状态请求 DTO。 */
export class SetPropertyStatusDto extends createZodDto(setPropertyStatusSchema) {}

/** 兼容按资源名称命名的 DTO 导出。 */
export const setRentalPropertyStatusSchema = setPropertyStatusSchema;
export { SetPropertyStatusDto as SetRentalPropertyStatusDto };
