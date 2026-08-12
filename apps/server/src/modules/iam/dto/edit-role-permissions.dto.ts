import { permissionKeys } from "@xpense/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const editRolePermissionsSchema = z
  .object({
    roleId: z.string().uuid(),
    permissionKeys: z.array(z.enum(permissionKeys)),
  })
  .strict();

export class EditRolePermissionsDto extends createZodDto(editRolePermissionsSchema) {}
