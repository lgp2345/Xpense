import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";

export const REQUIRE_PERMISSION_KEY = "xpense:require_permission";

export const RequirePermission = (permission: PermissionKey | readonly PermissionKey[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
