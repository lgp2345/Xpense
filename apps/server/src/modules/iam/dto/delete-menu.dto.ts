import { z } from "zod";

export const deleteMenuSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict();

/** 经过 deleteMenuSchema 校验并转换后的业务输入。 */
export type DeleteMenuDto = z.output<typeof deleteMenuSchema>;
