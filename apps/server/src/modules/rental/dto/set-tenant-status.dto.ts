import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 设置租户状态请求校验规则。 */
export const setTenantStatusSchema = z
  .object({ id: z.string().uuid(), isActive: z.boolean() })
  .strict();

/** 设置租户状态请求 DTO。 */
export class SetTenantStatusDto extends createZodDto(setTenantStatusSchema) {}

/** 兼容按资源名称命名的 DTO 导出。 */
export const setRentalTenantStatusSchema = setTenantStatusSchema;
export { SetTenantStatusDto as SetRentalTenantStatusDto };
