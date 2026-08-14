import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const updateMemberSchema = z
  .object({
    id: z.string().uuid(),
    roleId: z.string().uuid().optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine((value) => value.roleId !== undefined || value.status !== undefined, {
    message: "至少需要提供一项成员信息",
  });

export class UpdateMemberDto extends createZodDto(updateMemberSchema) {}
