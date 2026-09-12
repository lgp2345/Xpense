import { permissionKeys } from "@xpense/shared";
import { z } from "zod";

export const createRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9_.-]*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  permissionKeys: z.array(z.enum(permissionKeys)).default([]),
});

/** 经过 createRoleSchema 校验并转换后的业务输入。 */
export type CreateRoleDto = z.output<typeof createRoleSchema>;
