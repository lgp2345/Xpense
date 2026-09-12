import { z } from "zod";

/** 设置租户状态请求校验规则。 */
export const setTenantStatusSchema = z
  .object({ id: z.string().uuid(), isActive: z.boolean() })
  .strict();

/** 设置租户状态请求 DTO，由 setTenantStatusSchema 校验并转换。 */
export type SetTenantStatusDto = z.output<typeof setTenantStatusSchema>;

/** 兼容按资源名称命名的 DTO 导出。 */
export const setRentalTenantStatusSchema = setTenantStatusSchema;
export type { SetTenantStatusDto as SetRentalTenantStatusDto };
