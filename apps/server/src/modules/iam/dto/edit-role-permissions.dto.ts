import { permissionKeys } from "@xpense/shared";
import { z } from "zod";

export const editRolePermissionsSchema = z
  .object({
    roleId: z.string().uuid(),
    permissionKeys: z.array(z.enum(permissionKeys)),
  })
  .strict();

/** 经过 editRolePermissionsSchema 校验并转换后的业务输入。 */
export type EditRolePermissionsDto = z.output<typeof editRolePermissionsSchema>;
