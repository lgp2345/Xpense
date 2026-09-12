import { z } from "zod";

export const createMemberSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

/** 经过 createMemberSchema 校验并转换后的业务输入。 */
export type CreateMemberDto = z.output<typeof createMemberSchema>;
