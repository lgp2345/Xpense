import { z } from "zod";
/** 联系资料允许清空；不可变字段不属于此表单。 */
export const organizationSettingsSchema = z.object({
  contactName: z.string().trim().max(100, "联系人不能超过 100 字"),
  contactPhone: z.string().trim().max(40, "联系电话不能超过 40 字"),
  address: z.string().trim().max(500, "地址不能超过 500 字"),
});
export type OrganizationSettingsValues = z.infer<typeof organizationSettingsSchema>;
