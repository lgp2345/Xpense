import { z } from "zod";

export type LoginFormValues = {
  email: string;
  password: string;
};

export const loginSchema: z.ZodType<LoginFormValues, LoginFormValues> = z.object({
  email: z.string().trim().min(1, "请输入邮箱地址").email("请输入有效的邮箱地址"),
  password: z.string().min(1, "请输入密码"),
});
