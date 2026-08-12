import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const resolveMenuSchema = z
  .object({
    path: z.string().trim().min(1).max(2048).startsWith("/"),
  })
  .strict();

export class ResolveMenuDto extends createZodDto(resolveMenuSchema) {}
