import { type PermissionKey, permissionKeys } from "@xpense/shared";
import { z } from "zod";

export type RoleFormValues = {
  key: string;
  name: string;
  description: string;
  permissionKeys: PermissionKey[];
};

export function toRoleSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createRoleFormSchema(isEditing: boolean) {
  return z.object({
    key: isEditing
      ? z.string().min(1, "请输入角色标识")
      : z.string().refine((value) => toRoleSlug(value).length > 0, "请输入角色标识"),
    name: z.string().trim().min(1, "请输入角色名称"),
    description: z.string().trim(),
    permissionKeys: z.array(z.enum(permissionKeys)),
  });
}
