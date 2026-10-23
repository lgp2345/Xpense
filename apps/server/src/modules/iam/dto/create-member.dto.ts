import { chinaPhoneSchema } from "@xpense/shared";
import { z } from "zod";

/** 成员至少分配一个角色；重复角色属于无效输入。 */
export const memberRoleIdsSchema = z
  .array(z.uuid())
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length);

export const createMemberSchema = z.strictObject({
  phone: chinaPhoneSchema,
  username: z.string().trim().min(1).max(100),
  roleIds: memberRoleIdsSchema,
});

/** 经过 createMemberSchema 校验并转换后的业务输入。 */
export type CreateMemberDto = z.output<typeof createMemberSchema>;
