import { z } from "zod";

/** 删除租户请求校验规则。 */
export const deleteTenantSchema = z.object({ id: z.string().uuid() }).strict();

/** 删除租户请求 DTO，由 deleteTenantSchema 校验并转换。 */
export type DeleteTenantDto = z.output<typeof deleteTenantSchema>;

/** 兼容按资源名称命名的 DTO 导出。 */
export const deleteRentalTenantSchema = deleteTenantSchema;
export type { DeleteTenantDto as DeleteRentalTenantDto };
