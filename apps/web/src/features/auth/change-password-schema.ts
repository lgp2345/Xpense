import { z } from "zod";
/** 确认密码只在浏览器校验，不发给服务器。 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(6, "新密码至少 6 位").max(128, "新密码不能超过 128 位"),
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword)
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "两次输入的新密码不一致",
      });
    if (value.currentPassword === value.newPassword)
      ctx.addIssue({ code: "custom", path: ["newPassword"], message: "新密码不能与当前密码相同" });
  });
