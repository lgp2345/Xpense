import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const createMemberSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export class CreateMemberDto extends createZodDto(createMemberSchema) {}
