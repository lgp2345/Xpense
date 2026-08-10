// ── 仪表盘 ──────────────────────────────────────
const dashboardPermissions = ["dashboard:read"] as const;

// ── 菜单管理 ──────────────────────────────────────
const menuPermissions = ["menus:read", "menus:create", "menus:update", "menus:delete"] as const;

// ── 成员管理 ──────────────────────────────────────
const memberPermissions = [
  "members:read",
  "members:create",
  "members:update",
  "members:disable",
  "members:enable",
] as const;

// ── 角色管理 ──────────────────────────────────────
const rolePermissions = [
  "roles:read",
  "roles:create",
  "roles:update",
  "roles:delete",
  "roles:permissions:update",
  "permissions:read",
] as const;

// ── 会话管理 ──────────────────────────────────────
const sessionPermissions = ["sessions:read", "sessions:revoke"] as const;

// ── 审计日志 ──────────────────────────────────────
const auditPermissions = ["audit_logs:read"] as const;

// ── 记账 ──────────────────────────────────────────
const transactionPermissions = [
  "transactions:read",
  "transactions:create",
  "transactions:update",
  "transactions:delete",
] as const;

// ── 汇总（不修改此行逻辑）─────────────────────────
export const permissionKeys = [
  ...dashboardPermissions,
  ...menuPermissions,
  ...memberPermissions,
  ...rolePermissions,
  ...sessionPermissions,
  ...auditPermissions,
  ...transactionPermissions,
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export const systemRoleKeys = ["owner", "admin", "member", "viewer"] as const;

export type SystemRoleKey = (typeof systemRoleKeys)[number];

export const clientTypes = ["web_pc", "web_mobile", "app_ios", "app_android"] as const;

export type ClientType = (typeof clientTypes)[number];
