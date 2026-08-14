import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const deleteRoleSchema = z.object({
  id: z.string().uuid(),
});

export class DeleteRoleDto extends createZodDto(deleteRoleSchema) {}
