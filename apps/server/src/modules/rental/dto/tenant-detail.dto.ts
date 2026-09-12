import { z } from "zod";

/** 租户详情查询校验规则。 */
export const tenantDetailSchema = z.object({ id: z.string().uuid() }).strict();

/** 租户详情查询 DTO，由 tenantDetailSchema 校验并转换。 */
export type TenantDetailDto = z.output<typeof tenantDetailSchema>;

/** 兼容按资源名称命名的 DTO 导出。 */
export const rentalTenantDetailSchema = tenantDetailSchema;
export type { TenantDetailDto as RentalTenantDetailDto };
