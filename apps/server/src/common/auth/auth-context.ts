import type { PermissionKey } from "@xpense/shared";

export type AuthContext = {
  userId: string;
  sessionId: string;
  organizationId: string;
  isSuperAdmin: boolean;
  permissions: PermissionKey[];
};
