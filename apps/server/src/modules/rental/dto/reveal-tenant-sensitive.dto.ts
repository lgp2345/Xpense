import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** 查看租户完整敏感身份信息请求校验规则。 */
export const revealTenantSensitiveSchema = z.object({ id: z.string().uuid() }).strict();

/** 查看租户完整敏感身份信息请求 DTO。 */
export class RevealTenantSensitiveDto extends createZodDto(revealTenantSensitiveSchema) {}

/** 兼容按资源名称命名的 DTO 导出。 */
export const revealRentalTenantSensitiveSchema = revealTenantSensitiveSchema;
export { RevealTenantSensitiveDto as RevealRentalTenantSensitiveDto };
