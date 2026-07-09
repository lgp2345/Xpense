import type { PermissionKey } from "@xpense/shared";

export type PermissionState = {
  isSuperAdmin: boolean;
  permissions: readonly PermissionKey[];
};

export function createPermissionChecker(state: PermissionState) {
  const permissionSet = new Set(state.permissions);

  return {
    can: (permission: PermissionKey): boolean =>
      state.isSuperAdmin || permissionSet.has(permission),
    canAny: (permissions: readonly PermissionKey[]): boolean =>
      state.isSuperAdmin || permissions.some((permission) => permissionSet.has(permission)),
    canAll: (permissions: readonly PermissionKey[]): boolean =>
      state.isSuperAdmin || permissions.every((permission) => permissionSet.has(permission)),
  };
}
