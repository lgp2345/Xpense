import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userStatus = pgEnum("user_status", ["active", "disabled"]);
export const organizationStatus = pgEnum("organization_status", ["active", "disabled"]);
export const membershipStatus = pgEnum("membership_status", ["active", "disabled"]);
export const refreshSessionStatus = pgEnum("refresh_session_status", ["active", "revoked"]);
export const clientType = pgEnum("client_type", ["web_pc", "web_mobile", "app_ios", "app_android"]);
export const auditResult = pgEnum("audit_result", ["succeeded", "failed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: userStatus("status").notNull().default("active"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: organizationStatus("status").notNull().default("active"),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isSystem: boolean("is_system").notNull().default(false),
    isEditable: boolean("is_editable").notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("roles_organization_key_unique").on(table.organizationId, table.key)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
    description: text("description").notNull().default(""),
  },
  (table) => [uniqueIndex("permissions_key_unique").on(table.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    status: membershipStatus("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("memberships_organization_user_unique").on(table.organizationId, table.userId),
    index("memberships_organization_idx").on(table.organizationId),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const refreshSessions = pgTable(
  "refresh_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    currentOrganizationId: uuid("current_organization_id").references(() => organizations.id),
    clientType: clientType("client_type").notNull(),
    deviceIdHash: text("device_id_hash"),
    deviceName: text("device_name"),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    status: refreshSessionStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    ...timestamps,
  },
  (table) => [
    index("refresh_sessions_user_idx").on(table.userId),
    index("refresh_sessions_current_organization_idx").on(table.currentOrganizationId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    result: auditResult("result").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_organization_idx").on(table.organizationId),
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_action_idx").on(table.action),
  ],
);
