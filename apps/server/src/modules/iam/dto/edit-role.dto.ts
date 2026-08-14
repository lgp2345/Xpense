import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const editRoleSchema = z
  .object({
    roleId: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "至少需要提供一项角色信息",
  });

export class EditRoleDto extends createZodDto(editRoleSchema) {}
