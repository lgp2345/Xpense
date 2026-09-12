import { z } from "zod";

export const deleteRoleSchema = z.object({
  id: z.string().uuid(),
});

/** 经过 deleteRoleSchema 校验并转换后的业务输入。 */
export type DeleteRoleDto = z.output<typeof deleteRoleSchema>;
