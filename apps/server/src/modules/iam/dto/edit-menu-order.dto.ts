import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const editMenuOrderSchema = z
  .object({
    id: z.number().int().positive(),
    direction: z.enum(["up", "down"]),
  })
  .strict();

export class EditMenuOrderDto extends createZodDto(editMenuOrderSchema) {}
