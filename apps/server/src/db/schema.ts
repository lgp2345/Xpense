import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  primaryKey,
  snakeCase,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userStatus = pgEnum("user_status", ["active", "disabled"]);
export const organizationStatus = pgEnum("organization_status", ["active", "disabled"]);
export const membershipStatus = pgEnum("membership_status", ["active", "disabled"]);
export const refreshSessionStatus = pgEnum("refresh_session_status", ["active", "revoked"]);
export const clientType = pgEnum("client_type", ["web_pc", "web_mobile", "app_ios", "app_android"]);
export const auditResult = pgEnum("audit_result", ["succeeded", "failed"]);
export const menuType = pgEnum("menu_type", ["directory", "menu", "button"]);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

export const users = snakeCase.table(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    phone: text(),
    passwordHash: text().notNull(),
    status: userStatus().notNull().default("active"),
    isSuperAdmin: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_phone_unique").on(table.phone),
  ],
);

export const organizations = snakeCase.table("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  status: organizationStatus().notNull().default("active"),
  createdByUserId: uuid()
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const roles = snakeCase.table(
  "roles",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().references(() => organizations.id),
    key: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(""),
    isSystem: boolean().notNull().default(false),
    isEditable: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("roles_organization_key_unique").on(table.organizationId, table.key)],
);

export const permissions = snakeCase.table(
  "permissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull(),
    name: text().notNull(),
    resource: text().notNull(),
    action: text().notNull(),
    description: text().notNull().default(""),
  },
  (table) => [uniqueIndex("permissions_key_unique").on(table.key)],
);

export const rolePermissions = snakeCase.table(
  "role_permissions",
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id),
    permissionId: uuid()
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const organizationMemberships = snakeCase.table(
  "organization_memberships",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    roleId: uuid()
      .notNull()
      .references(() => roles.id),
    status: membershipStatus().notNull().default("active"),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("memberships_organization_user_unique").on(table.organizationId, table.userId),
    index("memberships_organization_idx").on(table.organizationId),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const refreshSessions = snakeCase.table(
  "refresh_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    currentOrganizationId: uuid().references(() => organizations.id),
    clientType: clientType().notNull(),
    deviceIdHash: text(),
    deviceName: text(),
    refreshTokenHash: text().notNull(),
    status: refreshSessionStatus().notNull().default("active"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    rotatedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    userAgent: text(),
    ipHash: text(),
    ...timestamps,
  },
  (table) => [
    index("refresh_sessions_user_idx").on(table.userId),
    index("refresh_sessions_current_organization_idx").on(table.currentOrganizationId),
  ],
);

export const auditLogs = snakeCase.table(
  "audit_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().references(() => organizations.id),
    actorUserId: uuid().references(() => users.id),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text(),
    result: auditResult().notNull(),
    metadata: jsonb().notNull().default({}),
    requestId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_organization_idx").on(table.organizationId),
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_action_idx").on(table.action),
  ],
);

export const menus = snakeCase.table(
  "menus",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    type: menuType().notNull(),
    name: text().notNull(),
    parentId: integer(),
    routeKey: text(),
    path: text(),
    icon: text(),
    permissionCode: text().references(() => permissions.key),
    isExternal: boolean(),
    isVisible: boolean(),
    keepAlive: boolean(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    check(
      "menus_directory_fields_check",
      sql`${table.type} <> 'directory' OR (
        ${table.routeKey} IS NULL
        AND ${table.path} IS NULL
        AND ${table.permissionCode} IS NULL
        AND ${table.isExternal} IS NULL
        AND ${table.keepAlive} IS NULL
        AND ${table.isVisible} IS NOT NULL
      )`,
    ),
    check(
      "menus_internal_menu_fields_check",
      sql`${table.type} <> 'menu' OR ${table.isExternal} IS TRUE OR (
        ${table.isExternal} IS FALSE
        AND ${table.routeKey} IS NOT NULL
        AND ${table.path} IS NULL
        AND ${table.permissionCode} IS NOT NULL
        AND ${table.isVisible} IS NOT NULL
        AND ${table.keepAlive} IS NOT NULL
      )`,
    ),
    check(
      "menus_external_menu_fields_check",
      sql`${table.type} <> 'menu' OR ${table.isExternal} IS FALSE OR (
        ${table.isExternal} IS TRUE
        AND ${table.routeKey} IS NULL
        AND ${table.path} IS NOT NULL
        AND ${table.permissionCode} IS NOT NULL
        AND ${table.isVisible} IS NOT NULL
        AND ${table.keepAlive} IS NULL
      )`,
    ),
    check(
      "menus_button_fields_check",
      sql`${table.type} <> 'button' OR (
        ${table.parentId} IS NOT NULL
        AND ${table.routeKey} IS NULL
        AND ${table.path} IS NULL
        AND ${table.icon} IS NULL
        AND ${table.permissionCode} IS NOT NULL
        AND ${table.isExternal} IS NULL
        AND ${table.isVisible} IS NULL
        AND ${table.keepAlive} IS NULL
      )`,
    ),
    uniqueIndex("menus_organization_route_key_unique")
      .on(table.organizationId, table.routeKey)
      .where(sql`${table.routeKey} IS NOT NULL`),
    uniqueIndex("menus_organization_path_unique")
      .on(table.organizationId, table.path)
      .where(sql`${table.path} IS NOT NULL`),
    unique("menus_organization_id_unique").on(table.organizationId, table.id),
    foreignKey({
      name: "menus_organization_parent_fk",
      columns: [table.organizationId, table.parentId],
      foreignColumns: [table.organizationId, table.id],
    }),
    index("menus_organization_idx").on(table.organizationId),
    index("menus_organization_parent_idx").on(table.organizationId, table.parentId),
    index("menus_organization_parent_sort_idx").on(
      table.organizationId,
      table.parentId,
      table.sortOrder,
    ),
  ],
);
