import { z } from "zod";

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .default({});

/** 经过 refreshSchema 校验并转换后的业务输入。 */
export type RefreshDto = z.output<typeof refreshSchema>;
