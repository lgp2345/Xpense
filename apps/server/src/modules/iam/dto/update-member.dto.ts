import { z } from "zod";
import { memberRoleIdsSchema } from "./create-member.dto.js";

export const updateMemberSchema = z
  .object({
    id: z.string().uuid(),
    roleId: z.string().uuid().optional(),
    roleIds: memberRoleIdsSchema.optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine(
    (value) =>
      value.roleId !== undefined || value.roleIds !== undefined || value.status !== undefined,
    {
      message: "至少需要提供一项成员信息",
    },
  )
  .refine((value) => value.roleId === undefined || value.roleIds === undefined, {
    message: "不能同时提供单角色和多角色",
  });

/** 经过 updateMemberSchema 校验并转换后的业务输入。 */
export type UpdateMemberDto = z.output<typeof updateMemberSchema>;
