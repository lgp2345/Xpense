import { z } from "zod";

/** 选填资料去除首尾空白；明确提交的空白保存为 null，未提交字段保持不变。 */
const optionalProfileText = z
  .string()
  .trim()
  .transform((value) => value || null)
  .nullable()
  .optional();

/** 只接收可修改的组织联系资料，拒绝名称、币种、时区等锁定字段。 */
export const updateOrganizationProfileSchema = z.strictObject({
  contactName: optionalProfileText,
  contactPhone: optionalProfileText,
  address: optionalProfileText,
});

/** 经过资料校验及空值归一化的业务输入。 */
export type UpdateOrganizationProfileDto = z.output<typeof updateOrganizationProfileSchema>;
