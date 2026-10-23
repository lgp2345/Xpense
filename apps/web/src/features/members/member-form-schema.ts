import { chinaPhoneSchema } from "@xpense/shared";
import { z } from "zod";

export const memberFormSchema = z.object({
  phone: chinaPhoneSchema,
  username: z.string().trim().min(1, "请输入用户名").max(100, "用户名不能超过 100 个字符"),
  roleIds: z
    .array(z.string().min(1))
    .min(1, "至少选择一个角色")
    .superRefine((roleIds, context) => {
      if (new Set(roleIds).size !== roleIds.length) {
        context.addIssue({ code: "custom", message: "角色不能重复选择" });
      }
    }),
});

export type MemberFormValues = z.infer<typeof memberFormSchema>;
