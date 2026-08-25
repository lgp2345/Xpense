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

// ── 账本 ──────────────────────────────────────────
const ledgerPermissions = ["ledgers:read"] as const;

// ── 账户 ──────────────────────────────────────────
const accountPermissions = [
  "accounts:read",
  "accounts:create",
  "accounts:update",
  "accounts:delete",
] as const;

// ── 分类 ──────────────────────────────────────────
const categoryPermissions = [
  "categories:read",
  "categories:create",
  "categories:update",
  "categories:delete",
] as const;

// ── 统计 ──────────────────────────────────────────
const statisticsPermissions = ["statistics:read"] as const;

// ── 租赁 ──────────────────────────────────────────
const rentalPermissions = [
  "rental_properties:read",
  "rental_properties:create",
  "rental_properties:update",
  "rental_properties:delete",
  "rental_spaces:read",
  "rental_spaces:create",
  "rental_spaces:update",
  "rental_spaces:delete",
] as const;

// ── 汇总（不修改此行逻辑）─────────────────────────
export const permissionKeys = [
  ...dashboardPermissions,
  ...menuPermissions,
  ...memberPermissions,
  ...rolePermissions,
  ...sessionPermissions,
  ...auditPermissions,
  ...ledgerPermissions,
  ...accountPermissions,
  ...categoryPermissions,
  ...transactionPermissions,
  ...statisticsPermissions,
  ...rentalPermissions,
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export const systemRoleKeys = ["owner", "admin", "member", "viewer"] as const;

export type SystemRoleKey = (typeof systemRoleKeys)[number];

export const clientTypes = ["web_pc", "web_mobile", "app_ios", "app_android"] as const;

export type ClientType = (typeof clientTypes)[number];
