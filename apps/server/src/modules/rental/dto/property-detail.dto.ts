import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 租赁房产详情查询校验规则。 */
export const propertyDetailSchema = z.object({ id: z.string().uuid() }).strict();

/** 租赁房产详情查询 DTO。 */
export class PropertyDetailDto extends createZodDto(propertyDetailSchema) {}

/** 兼容按资源名称命名的 schema 导出。 */
export const rentalPropertyDetailSchema = propertyDetailSchema;
export { PropertyDetailDto as RentalPropertyDetailDto };
