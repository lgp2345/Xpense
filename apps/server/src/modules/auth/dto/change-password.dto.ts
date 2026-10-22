import { z } from "zod";

/** 自主改密只接收当前密码与新密码；确认密码属于界面校验。 */
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
});
export type ChangePasswordDto = z.output<typeof changePasswordSchema>;
