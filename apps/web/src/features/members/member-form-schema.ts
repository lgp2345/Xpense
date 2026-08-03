import { z } from "zod";

export const memberFormSchema = z.object({
  userId: z.string().trim().min(1, "请输入用户 ID").uuid("请输入有效的 UUID"),
  roleId: z.string().min(1, "请选择角色"),
});

export type MemberFormValues = z.infer<typeof memberFormSchema>;
