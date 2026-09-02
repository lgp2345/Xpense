import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 租户详情查询校验规则。 */
export const tenantDetailSchema = z.object({ id: z.string().uuid() }).strict();

/** 租户详情查询 DTO。 */
export class TenantDetailDto extends createZodDto(tenantDetailSchema) {}

/** 兼容按资源名称命名的 DTO 导出。 */
export const rentalTenantDetailSchema = tenantDetailSchema;
export { TenantDetailDto as RentalTenantDetailDto };
