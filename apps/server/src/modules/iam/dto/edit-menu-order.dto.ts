import { z } from "zod";

export const editMenuOrderSchema = z
  .object({
    id: z.number().int().positive(),
    direction: z.enum(["up", "down"]),
  })
  .strict();

/** 经过 editMenuOrderSchema 校验并转换后的业务输入。 */
export type EditMenuOrderDto = z.output<typeof editMenuOrderSchema>;
