import { z } from "zod";

export const updateRoleSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "至少需要提供一项角色信息",
  });

/** 经过 updateRoleSchema 校验并转换后的业务输入。 */
export type UpdateRoleDto = z.output<typeof updateRoleSchema>;
