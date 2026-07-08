import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const updateMemberSchema = z
  .object({
    roleId: z.string().uuid().optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine((value) => value.roleId !== undefined || value.status !== undefined, {
    message: "At least one member field is required",
  });

export class UpdateMemberDto extends createZodDto(updateMemberSchema) {}
