import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const deleteMenuSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict();

export class DeleteMenuDto extends createZodDto(deleteMenuSchema) {}
