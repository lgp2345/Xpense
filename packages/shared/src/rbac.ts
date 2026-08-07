export const permissionKeys = [
  "members:read",
  "members:create",
  "members:update",
  "members:disable",
  "members:enable",
  "roles:read",
  "roles:create",
  "roles:update",
  "roles:delete",
  "roles:permissions:update",
  "permissions:read",
  "sessions:read",
  "sessions:revoke",
  "audit_logs:read",
  "transactions:read",
  "transactions:create",
  "transactions:update",
  "transactions:delete",
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export const systemRoleKeys = ["owner", "admin", "member", "viewer"] as const;

export type SystemRoleKey = (typeof systemRoleKeys)[number];

export const clientTypes = ["web_pc", "web_mobile", "app_ios", "app_android"] as const;

export type ClientType = (typeof clientTypes)[number];
