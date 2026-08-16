import { chinaPhoneRegex } from "@xpense/shared";
import { z } from "zod";

export type LoginFormValues = {
  phone: string;
  password: string;
  captchaText: string;
};

export const loginSchema: z.ZodType<LoginFormValues, LoginFormValues> = z.object({
  phone: z.string().trim().min(1, "请输入手机号").regex(chinaPhoneRegex, "请输入有效的手机号"),
  password: z.string().min(1, "请输入密码"),
  captchaText: z.string().trim().min(1, "请输入验证码"),
});
