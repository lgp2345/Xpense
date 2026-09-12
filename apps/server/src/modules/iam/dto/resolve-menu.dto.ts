import { z } from "zod";

export const resolveMenuSchema = z
  .object({
    path: z.string().trim().min(1).max(2048).startsWith("/"),
  })
  .strict();

/** 经过 resolveMenuSchema 校验并转换后的业务输入。 */
export type ResolveMenuDto = z.output<typeof resolveMenuSchema>;
