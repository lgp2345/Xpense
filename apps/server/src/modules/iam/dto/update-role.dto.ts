import { permissionKeys } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    permissionKeys: z.array(z.enum(permissionKeys)).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.permissionKeys !== undefined,
    {
      message: "至少需要提供一项角色信息",
    },
  );

export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
