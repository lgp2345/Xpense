import { chinaPhoneSchema } from "@xpense/shared";
import { z } from "zod";
/** 平台详情只按明确组织 ID 查询，账号预检只按精确手机号查询。 */
export const organizationDetailQuerySchema = z.strictObject({ id: z.uuid() });
export const organizationOwnerQuerySchema = z.strictObject({ phone: chinaPhoneSchema });
export type OrganizationDetailQuery = z.output<typeof organizationDetailQuerySchema>;
export type OrganizationOwnerQuery = z.output<typeof organizationOwnerQuerySchema>;
