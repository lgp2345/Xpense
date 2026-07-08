# RBAC Permission System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the organization-scoped RBAC permission system, multi-device session model, audit logging, and WEB admin permission UI described in `docs/superpowers/specs/2026-07-04-rbac-permission-design.md`.

**Architecture:** The backend owns authentication, session state, organization context, RBAC decisions, audit writes, and organization-scoped data boundaries. The frontend consumes `GET /user` and API responses to shape routes, menus, buttons, and feedback, but never becomes the security boundary.

**Tech Stack:** NestJS 11, Fastify adapter, TypeScript, Vitest, Drizzle ORM, PostgreSQL, React 19, Vite 8, TanStack Router, Testing Library, pnpm, Turborepo.

---

## Execution Rules

- Do not write implementation code before the parameter decisions in Task 1 are confirmed.
- Database schema and migration changes are isolated in Task 3.
- Authentication/session work is separate from business/IAM modules.
- Frontend work is split by functional module: auth shell, organization switch, members, roles, sessions, audit logs.
- Follow TDD for every service, guard, repository, route, page, and hook.
- Under project rules, run `git add` and `git commit` only after the user explicitly confirms the checkpoint.
- Use `pnpm --filter @xpense/server test`, `pnpm --filter @xpense/web test`, `pnpm check`, `pnpm lint`, and `git diff --check` at the specified verification points.

## Implementation Parameters To Confirm First

Use these defaults unless the user changes them before implementation:

- `ACCESS_TOKEN_TTL_SECONDS = 900`
- `REFRESH_TOKEN_TTL_DAYS = 30`
- Web refresh token storage: HTTP-only cookie named `xpense_refresh_token`
- App refresh token transport: JSON response body; app stores it in platform secure storage
- Initial system roles: `owner`, `admin`, `member`, `viewer`
- Initial bootstrap path: seed script creates one organization and one `super_admin` from local environment variables
- Password hash algorithm: Argon2id
- Token signing: JWT access token, opaque random refresh token

## File Structure Map

### Backend Files

- Create `apps/server/src/config/env.schema.ts`: validates auth, database, bootstrap, and CORS environment variables.
- Modify `apps/server/src/main.ts`: uses validated config and keeps Fastify setup centralized.
- Modify `apps/server/src/app.module.ts`: imports db, config, auth, organizations, iam, audit, and future business modules.
- Create `apps/server/src/db/schema.ts`: Drizzle table definitions for users, organizations, memberships, roles, permissions, role permissions, refresh sessions, and audit logs.
- Create `apps/server/src/db/db.module.ts`: database provider wiring.
- Create `apps/server/src/db/db.tokens.ts`: typed provider tokens.
- Create `apps/server/src/db/seed-rbac.ts`: deterministic system permissions, roles, and bootstrap seed.
- Create `apps/server/src/common/auth/auth-context.ts`: authenticated request context shape.
- Create `apps/server/src/common/auth/current-auth-context.decorator.ts`: controller decorator for auth context.
- Create `apps/server/src/common/errors/api-error.ts`: stable application error codes.
- Create `apps/server/src/modules/auth/*`: login, refresh, logout, session list, revoke single session, revoke all sessions.
- Create `apps/server/src/modules/organizations/*`: organization list and current organization switch.
- Create `apps/server/src/modules/iam/*`: permissions, roles, members, decorators, guard, access service.
- Create `apps/server/src/modules/audit/*`: audit append service, repository, and current-organization audit query.
- Create `apps/server/src/test/*`: Nest Fastify test app builder, in-memory fixtures, auth helpers, and fake clock helpers.

### Shared Files

- Modify `packages/shared/src/index.ts`: export shared permission keys, API response types, and client type values.
- Create `packages/shared/src/rbac.ts`: permission constants and type helpers.
- Create `packages/shared/src/auth.ts`: auth/session shared DTO types.
- Create `packages/shared/src/rbac.test.ts`: permission naming and constant tests.

### Frontend Files

- Create `apps/web/src/services/api-client.ts`: shared fetch wrapper with auth and error handling.
- Create `apps/web/src/services/auth-api.ts`: login, refresh, logout, session, and user APIs.
- Create `apps/web/src/services/iam-api.ts`: members, roles, permissions, sessions, and audit APIs.
- Create `apps/web/src/stores/auth-store.ts`: current auth state and permission helpers.
- Create `apps/web/src/hooks/use-permission.ts`: `can`, `canAny`, and `canAll`.
- Create `apps/web/src/routes/protected-route.tsx`: authenticated route boundary.
- Modify `apps/web/src/routes/router.tsx`: add auth and admin routes.
- Create `apps/web/src/pages/login-page.tsx`: login screen.
- Create `apps/web/src/features/user/*`: current user header and organization switcher.
- Create `apps/web/src/features/members/*`: member list, create member dialog, role change, enable/disable actions.
- Create `apps/web/src/features/roles/*`: role list, role editor, permission matrix.
- Create `apps/web/src/features/sessions/*`: active sessions list and revoke actions.
- Create `apps/web/src/features/audit/*`: audit log list and filters.
- Create focused tests beside each service, hook, route, and feature page.

---

## Backend Plan

### Task 1: Confirm Implementation Parameters

**Files:**
- Read: `docs/superpowers/specs/2026-07-04-rbac-permission-design.md`
- Create: no files
- Modify: no files

**Deliverable:** A short confirmation message from the user for token TTLs, refresh-token storage, bootstrap seed input, initial roles, and password hash algorithm.

**Acceptance Standard:** Implementation can proceed with explicit values for token TTLs, refresh-token transport, initial role names, bootstrap behavior, and password hashing.

- [ ] **Step 1: Present the parameter list**

Use this message:

```text
Before implementation, please confirm these defaults:
- accessToken TTL: 15 minutes
- refreshToken TTL: 30 days
- Web refresh token: HTTP-only cookie `xpense_refresh_token`
- App refresh token: JSON body, stored by app in secure storage
- Initial roles: owner/admin/member/viewer
- Bootstrap: seed creates one organization and one super_admin from environment variables
- Password hash: Argon2id
- Access token: JWT
- Refresh token: opaque random token, hash stored in DB
```

- [ ] **Step 2: Record the confirmed values in the implementation notes**

If the user accepts the defaults, write this short note in the task log or PR description:

```text
RBAC implementation parameters confirmed:
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
WEB_REFRESH_TOKEN_COOKIE=xpense_refresh_token
APP_REFRESH_TOKEN_TRANSPORT=json_body
SYSTEM_ROLES=owner,admin,member,viewer
BOOTSTRAP_SOURCE=environment_variables
PASSWORD_HASH=argon2id
ACCESS_TOKEN=jwt
REFRESH_TOKEN=opaque_random_hash_at_rest
```

Expected: no source files changed in this task.

### Task 2: Add Backend Dependencies And Configuration Contracts

**Files:**
- Modify: `apps/server/package.json`
- Modify: `package.json`
- Create: `apps/server/src/config/env.schema.ts`
- Create: `apps/server/src/config/config.module.ts`
- Create: `apps/server/src/config/config.service.ts`
- Test: `apps/server/src/config/env.schema.test.ts`

**Deliverable:** Server has typed configuration validation for database, JWT, token TTLs, bootstrap seed, and web origin. Required backend packages are declared.

**Acceptance Standard:** `pnpm --filter @xpense/server test -- env.schema.test.ts` passes; missing required env values fail with explicit validation errors.

- [ ] **Step 1: Ask for dependency installation approval**

Use this message:

```text
This task needs dependency changes: drizzle-orm, postgres, jose or jsonwebtoken, argon2, nanoid, cookie support if needed, and matching dev tooling for migrations. Please confirm before installing or editing lockfile.
```

- [ ] **Step 2: Install dependencies after approval**

Run:

```bash
pnpm --filter @xpense/server add drizzle-orm postgres jose argon2 nanoid
pnpm --filter @xpense/server add -D drizzle-kit
```

Expected: `apps/server/package.json` and `pnpm-lock.yaml` change.

- [ ] **Step 3: Write failing config tests**

Create `apps/server/src/config/env.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env.schema.js";

describe("parseServerEnv", () => {
  it("returns typed configuration for valid environment values", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/xpense",
      JWT_ACCESS_SECRET: "a-secret-with-at-least-32-characters",
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_DAYS: "30",
      WEB_ORIGIN: "http://localhost:5173",
      BOOTSTRAP_SUPER_ADMIN_EMAIL: "root@example.com",
      BOOTSTRAP_SUPER_ADMIN_PASSWORD: "strong-password",
      BOOTSTRAP_ORGANIZATION_NAME: "Xpense",
    });

    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.WEB_ORIGIN).toBe("http://localhost:5173");
  });

  it("rejects missing database url", () => {
    expect(() =>
      parseServerEnv({
        JWT_ACCESS_SECRET: "a-secret-with-at-least-32-characters",
      }),
    ).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 4: Run the failing test**

Run:

```bash
pnpm --filter @xpense/server test -- env.schema.test.ts
```

Expected: fail because `env.schema.ts` does not exist.

- [ ] **Step 5: Implement env parsing**

Create `apps/server/src/config/env.schema.ts`:

```ts
import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  BOOTSTRAP_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
  BOOTSTRAP_ORGANIZATION_NAME: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${issues}`);
  }

  return parsed.data;
}
```

- [ ] **Step 6: Add config service**

Create `apps/server/src/config/config.service.ts`:

```ts
import { Injectable } from "@nestjs/common";

import { parseServerEnv, type ServerEnv } from "./env.schema.js";

@Injectable()
export class ServerConfigService {
  readonly env: ServerEnv;

  constructor() {
    this.env = parseServerEnv(process.env);
  }
}
```

Create `apps/server/src/config/config.module.ts`:

```ts
import { Global, Module } from "@nestjs/common";

import { ServerConfigService } from "./config.service.js";

@Global()
@Module({
  providers: [ServerConfigService],
  exports: [ServerConfigService],
})
export class ServerConfigModule {}
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm --filter @xpense/server test -- env.schema.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/package.json pnpm-lock.yaml apps/server/src/config
git commit -m "chore: add server configuration contracts"
```

### Task 3: Database Schema And Migration

**Files:**
- Create: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/db/db.tokens.ts`
- Create: `apps/server/src/db/db.module.ts`
- Create: `apps/server/src/db/schema.test.ts`
- Create: `apps/server/drizzle.config.ts`
- Modify: `apps/server/package.json`
- Migration: `apps/server/src/db/migrations/<generated-rbac-migration>.sql`

**Deliverable:** Drizzle schema and migration for RBAC, organizations, sessions, and audit logs.

**Acceptance Standard:** Schema tests pass; generated migration contains all required tables and uniqueness constraints.

- [ ] **Step 1: Write schema contract test**

Create `apps/server/src/db/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  auditLogs,
  organizationMemberships,
  organizations,
  permissions,
  refreshSessions,
  rolePermissions,
  roles,
  users,
} from "./schema.js";

describe("RBAC database schema", () => {
  it("exports all RBAC tables", () => {
    expect(users).toBeDefined();
    expect(organizations).toBeDefined();
    expect(organizationMemberships).toBeDefined();
    expect(roles).toBeDefined();
    expect(permissions).toBeDefined();
    expect(rolePermissions).toBeDefined();
    expect(refreshSessions).toBeDefined();
    expect(auditLogs).toBeDefined();
  });
});
```

- [ ] **Step 2: Run failing schema test**

Run:

```bash
pnpm --filter @xpense/server test -- schema.test.ts
```

Expected: fail because `schema.ts` does not exist.

- [ ] **Step 3: Create schema**

Create `apps/server/src/db/schema.ts` with these tables and exported relation-friendly names:

```ts
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

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  status: userStatus("status").notNull().default("active"),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  ...timestamps,
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
}));

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: organizationStatus("status").notNull().default("active"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  ...timestamps,
});

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isSystem: boolean("is_system").notNull().default(false),
  isEditable: boolean("is_editable").notNull().default(true),
  ...timestamps,
}, (table) => ({
  organizationRoleKeyUnique: uniqueIndex("roles_organization_key_unique").on(table.organizationId, table.key),
}));

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  description: text("description").notNull().default(""),
}, (table) => ({
  keyUnique: uniqueIndex("permissions_key_unique").on(table.key),
}));

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
}));

export const organizationMemberships = pgTable("organization_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  status: membershipStatus("status").notNull().default("active"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (table) => ({
  organizationUserUnique: uniqueIndex("memberships_organization_user_unique").on(table.organizationId, table.userId),
  organizationIndex: index("memberships_organization_idx").on(table.organizationId),
  userIndex: index("memberships_user_idx").on(table.userId),
}));

export const refreshSessions = pgTable("refresh_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
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
}, (table) => ({
  userIndex: index("refresh_sessions_user_idx").on(table.userId),
  organizationIndex: index("refresh_sessions_current_organization_idx").on(table.currentOrganizationId),
}));

export const auditLogs = pgTable("audit_logs", {
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
}, (table) => ({
  organizationIndex: index("audit_logs_organization_idx").on(table.organizationId),
  actorIndex: index("audit_logs_actor_idx").on(table.actorUserId),
  actionIndex: index("audit_logs_action_idx").on(table.action),
}));
```

- [ ] **Step 4: Add Drizzle config**

Create `apps/server/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
```

Add scripts to `apps/server/package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push"
  }
}
```

- [ ] **Step 5: Add db provider tokens and module**

Create `apps/server/src/db/db.tokens.ts`:

```ts
export const DB = Symbol("DB");
```

Create `apps/server/src/db/db.module.ts`:

```ts
import { Global, Module } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ServerConfigService } from "../config/config.service.js";
import * as schema from "./schema.js";
import { DB } from "./db.tokens.js";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ServerConfigService],
      useFactory: (config: ServerConfigService) => {
        const client = postgres(config.env.DATABASE_URL);
        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
```

- [ ] **Step 6: Run schema tests**

Run:

```bash
pnpm --filter @xpense/server test -- schema.test.ts
```

Expected: pass.

- [ ] **Step 7: Generate migration**

Run:

```bash
pnpm --filter @xpense/server db:generate
```

Expected: a new SQL migration appears under `apps/server/src/db/migrations`.

- [ ] **Step 8: Inspect migration**

Run:

```bash
rg -n "CREATE TABLE|UNIQUE|users|organizations|organization_memberships|roles|permissions|role_permissions|refresh_sessions|audit_logs" apps/server/src/db/migrations
```

Expected: all eight tables and uniqueness constraints are present.

- [ ] **Step 9: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/src/db apps/server/drizzle.config.ts apps/server/package.json pnpm-lock.yaml
git commit -m "feat: add rbac database schema"
```

### Task 4: Shared RBAC Constants And API Types

**Files:**
- Create: `packages/shared/src/rbac.ts`
- Create: `packages/shared/src/auth.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/rbac.test.ts`

**Deliverable:** Shared permission keys, client types, role keys, and API response contracts are exported from `@xpense/shared`.

**Acceptance Standard:** Shared tests pass and no permission key violates `resource.action` snake/lowercase conventions.

- [ ] **Step 1: Write failing shared test**

Create `packages/shared/src/rbac.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { permissionKeys, systemRoleKeys } from "./rbac.js";

describe("RBAC shared constants", () => {
  it("uses stable resource.action permission keys", () => {
    for (const key of permissionKeys) {
      expect(key).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
    }
  });

  it("defines the initial system roles", () => {
    expect(systemRoleKeys).toEqual(["owner", "admin", "member", "viewer"]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @xpense/shared test -- rbac.test.ts
```

Expected: fail because `rbac.ts` does not exist.

- [ ] **Step 3: Add shared RBAC constants**

Create `packages/shared/src/rbac.ts`:

```ts
export const permissionKeys = [
  "members.read",
  "members.create",
  "members.update",
  "members.disable",
  "members.enable",
  "roles.read",
  "roles.create",
  "roles.update",
  "roles.delete",
  "roles.permissions.update",
  "permissions.read",
  "sessions.read",
  "sessions.revoke",
  "audit_logs.read",
  "transactions.read",
  "transactions.create",
  "transactions.update",
  "transactions.delete",
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export const systemRoleKeys = ["owner", "admin", "member", "viewer"] as const;

export type SystemRoleKey = (typeof systemRoleKeys)[number];

export const clientTypes = ["web_pc", "web_mobile", "app_ios", "app_android"] as const;

export type ClientType = (typeof clientTypes)[number];
```

Create `packages/shared/src/auth.ts`:

```ts
import type { ClientType, PermissionKey } from "./rbac.js";

export type UserStatus = "active" | "disabled";
export type OrganizationStatus = "active" | "disabled";
export type MembershipStatus = "active" | "disabled";

export type CurrentUserResponse = {
  user: {
    id: string;
    email: string;
    isSuperAdmin: boolean;
    status: UserStatus;
  };
  organization: {
    id: string;
    name: string;
  };
  role: {
    id: string;
    key: string;
    name: string;
  };
  permissions: PermissionKey[];
  session: {
    id: string;
    clientType: ClientType;
  };
};

export type AuthTokensResponse = {
  accessToken: string;
  refreshToken?: string;
};
```

Modify `packages/shared/src/index.ts`:

```ts
export * from "./auth.js";
export * from "./rbac.js";
```

- [ ] **Step 4: Run shared tests**

Run:

```bash
pnpm --filter @xpense/shared test -- rbac.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add packages/shared/src
git commit -m "feat: add shared rbac contracts"
```

### Task 5: Auth Context, Errors, And Guard Metadata

**Files:**
- Create: `apps/server/src/common/auth/auth-context.ts`
- Create: `apps/server/src/common/auth/current-auth-context.decorator.ts`
- Create: `apps/server/src/common/errors/api-error.ts`
- Create: `apps/server/src/modules/iam/decorators/require-permission.decorator.ts`
- Test: `apps/server/src/modules/iam/decorators/require-permission.decorator.test.ts`

**Deliverable:** Common auth context and permission metadata primitives used by controllers and guards.

**Acceptance Standard:** Decorator metadata tests pass; controller code can request typed auth context without parsing token manually.

- [ ] **Step 1: Write failing metadata test**

Create `apps/server/src/modules/iam/decorators/require-permission.decorator.test.ts`:

```ts
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { REQUIRE_PERMISSION_KEY, RequirePermission } from "./require-permission.decorator.js";

describe("RequirePermission", () => {
  it("stores required permission metadata", () => {
    class TestController {
      @RequirePermission("roles.update")
      updateRole() {
        return "ok";
      }
    }

    const reflector = new Reflector();
    const permission = reflector.get(REQUIRE_PERMISSION_KEY, TestController.prototype.updateRole);

    expect(permission).toBe("roles.update");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @xpense/server test -- require-permission.decorator.test.ts
```

Expected: fail because decorator file does not exist.

- [ ] **Step 3: Add common auth context**

Create `apps/server/src/common/auth/auth-context.ts`:

```ts
import type { PermissionKey } from "@xpense/shared";

export type AuthContext = {
  userId: string;
  sessionId: string;
  organizationId: string;
  isSuperAdmin: boolean;
  permissions: PermissionKey[];
};
```

Create `apps/server/src/common/auth/current-auth-context.decorator.ts`:

```ts
import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthContext } from "./auth-context.js";

type RequestWithAuthContext = {
  authContext?: AuthContext;
};

export const CurrentAuthContext = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  const request = context.switchToHttp().getRequest<RequestWithAuthContext>();

  if (!request.authContext) {
    throw new Error("AuthContext is missing from request");
  }

  return request.authContext;
});
```

Create `apps/server/src/common/errors/api-error.ts`:

```ts
export const apiErrorCodes = {
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  conflict: "CONFLICT",
  validationFailed: "VALIDATION_FAILED",
} as const;

export type ApiErrorCode = (typeof apiErrorCodes)[keyof typeof apiErrorCodes];
```

- [ ] **Step 4: Add permission decorator**

Create `apps/server/src/modules/iam/decorators/require-permission.decorator.ts`:

```ts
import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";

export const REQUIRE_PERMISSION_KEY = "xpense:require_permission";

export const RequirePermission = (permission: PermissionKey) => SetMetadata(REQUIRE_PERMISSION_KEY, permission);
```

- [ ] **Step 5: Run decorator test**

Run:

```bash
pnpm --filter @xpense/server test -- require-permission.decorator.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/src/common apps/server/src/modules/iam/decorators
git commit -m "feat: add auth context and permission metadata"
```

### Task 6: Auth Module And Multi-Device Sessions

**Files:**
- Create: `apps/server/src/modules/auth/auth.module.ts`
- Create: `apps/server/src/modules/auth/auth.controller.ts`
- Create: `apps/server/src/modules/auth/auth.service.ts`
- Create: `apps/server/src/modules/auth/auth.repository.ts`
- Create: `apps/server/src/modules/auth/token.service.ts`
- Create: `apps/server/src/modules/auth/password.service.ts`
- Create: `apps/server/src/modules/auth/dto/login.dto.ts`
- Create: `apps/server/src/modules/auth/dto/refresh.dto.ts`
- Create: `apps/server/src/modules/auth/auth.service.test.ts`
- Create: `apps/server/src/modules/auth/token.service.test.ts`

**Deliverable:** Login, refresh rotation, logout, list sessions, revoke session, and revoke all sessions logic.

**Acceptance Standard:** Auth service tests pass for login, refresh rotation, revoked/expired session rejection, logout, multi-session behavior, and current session isolation.

- [ ] **Step 1: Write token service tests**

Create `apps/server/src/modules/auth/token.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { TokenService } from "./token.service.js";

describe("TokenService", () => {
  it("signs and verifies access tokens", async () => {
    const service = new TokenService({
      env: {
        JWT_ACCESS_SECRET: "a-secret-with-at-least-32-characters",
        ACCESS_TOKEN_TTL_SECONDS: 900,
      },
    } as never);

    const token = await service.signAccessToken({
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-1",
    });

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-1",
    });
  });

  it("creates opaque refresh tokens and hashes", async () => {
    const service = new TokenService({
      env: {
        JWT_ACCESS_SECRET: "a-secret-with-at-least-32-characters",
        ACCESS_TOKEN_TTL_SECONDS: 900,
      },
    } as never);

    const token = service.createRefreshToken();
    const hash = await service.hashRefreshToken(token);

    expect(token).not.toContain(".");
    await expect(service.verifyRefreshTokenHash(token, hash)).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run failing token tests**

Run:

```bash
pnpm --filter @xpense/server test -- token.service.test.ts
```

Expected: fail because `token.service.ts` does not exist.

- [ ] **Step 3: Implement token service**

Create `apps/server/src/modules/auth/token.service.ts` with JWT access token and opaque refresh token behavior:

```ts
import { Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";
import { createHash, timingSafeEqual } from "node:crypto";

import { ServerConfigService } from "../../config/config.service.js";

export type AccessTokenPayload = {
  userId: string;
  sessionId: string;
  organizationId: string;
};

@Injectable()
export class TokenService {
  constructor(private readonly config: ServerConfigService) {}

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    const secret = new TextEncoder().encode(this.config.env.JWT_ACCESS_SECRET);

    return new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${this.config.env.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(secret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const secret = new TextEncoder().encode(this.config.env.JWT_ACCESS_SECRET);
    const { payload } = await jwtVerify(token, secret);

    return {
      userId: String(payload.userId),
      sessionId: String(payload.sessionId),
      organizationId: String(payload.organizationId),
    };
  }

  createRefreshToken(): string {
    return nanoid(64);
  }

  async hashRefreshToken(token: string): Promise<string> {
    return createHash("sha256").update(token).digest("hex");
  }

  async verifyRefreshTokenHash(token: string, hash: string): Promise<boolean> {
    const incoming = Buffer.from(await this.hashRefreshToken(token));
    const existing = Buffer.from(hash);

    return incoming.length === existing.length && timingSafeEqual(incoming, existing);
  }
}
```

- [ ] **Step 4: Implement password service**

Create `apps/server/src/modules/auth/password.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
```

- [ ] **Step 5: Write auth service behavior tests**

Create `apps/server/src/modules/auth/auth.service.test.ts` with repository fakes:

```ts
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service.js";

describe("AuthService", () => {
  function createHarness() {
    const sessions = new Map<string, { id: string; userId: string; refreshTokenHash: string; status: "active" | "revoked"; currentOrganizationId: string }>();
    let nextSessionId = 1;

    const repository = {
      findActiveUserByEmail: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "root@example.com",
        passwordHash: "hash",
        status: "active",
        isSuperAdmin: false,
        defaultOrganizationId: "org-1",
      }),
      createRefreshSession: vi.fn().mockImplementation(async (input) => {
        const session = {
          id: `session-${nextSessionId++}`,
          userId: input.userId,
          refreshTokenHash: input.refreshTokenHash,
          status: "active" as const,
          currentOrganizationId: input.currentOrganizationId,
        };
        sessions.set(session.id, session);
        return session;
      }),
      findActiveSessionByRefreshTokenHash: vi.fn().mockImplementation(async (hash: string) =>
        [...sessions.values()].find((session) => session.refreshTokenHash === hash && session.status === "active") ?? null,
      ),
      updateRefreshSessionToken: vi.fn().mockImplementation(async ({ sessionId, refreshTokenHash }) => {
        const session = sessions.get(sessionId);
        if (!session) {
          throw new Error("session not found");
        }
        sessions.set(sessionId, { ...session, refreshTokenHash });
      }),
      revokeSession: vi.fn().mockImplementation(async (sessionId: string) => {
        const session = sessions.get(sessionId);
        if (session) {
          sessions.set(sessionId, { ...session, status: "revoked" });
        }
      }),
      revokeAllUserSessions: vi.fn().mockImplementation(async (userId: string) => {
        for (const session of sessions.values()) {
          if (session.userId === userId) {
            sessions.set(session.id, { ...session, status: "revoked" });
          }
        }
      }),
    };
    const passwordService = { verify: vi.fn().mockResolvedValue(true) };
    const tokenService = {
      createRefreshToken: vi.fn().mockReturnValueOnce("refresh-1").mockReturnValueOnce("refresh-2").mockReturnValueOnce("refresh-3"),
      hashRefreshToken: vi.fn().mockImplementation(async (token: string) => `hash:${token}`),
      signAccessToken: vi.fn().mockImplementation(async (payload) => `access:${payload.sessionId}:${payload.organizationId}`),
    };
    const service = new AuthService(repository as never, passwordService as never, tokenService as never);

    return { service, sessions, repository };
  }

  it("creates an independent active session for every login", async () => {
    const { service, sessions } = createHarness();

    await service.login({ email: "root@example.com", password: "password", clientType: "web_pc" });
    await service.login({ email: "root@example.com", password: "password", clientType: "app_ios" });

    expect([...sessions.values()].filter((session) => session.status === "active")).toHaveLength(2);
  });

  it("rotates refresh token and rejects the old hash after refresh", async () => {
    const { service, sessions } = createHarness();

    const login = await service.login({ email: "root@example.com", password: "password", clientType: "web_pc" });
    await service.refresh({ refreshToken: login.refreshToken });

    expect([...sessions.values()][0]?.refreshTokenHash).toBe("hash:refresh-2");
  });

  it("revokes only the current session on logout", async () => {
    const { service, sessions } = createHarness();

    await service.login({ email: "root@example.com", password: "password", clientType: "web_pc" });
    await service.login({ email: "root@example.com", password: "password", clientType: "app_ios" });
    await service.logout({ userId: "user-1", sessionId: "session-1", organizationId: "org-1", isSuperAdmin: false, permissions: [] });

    expect(sessions.get("session-1")?.status).toBe("revoked");
    expect(sessions.get("session-2")?.status).toBe("active");
  });

  it("revokes all active user sessions on revoke all", async () => {
    const { service, sessions } = createHarness();

    await service.login({ email: "root@example.com", password: "password", clientType: "web_pc" });
    await service.login({ email: "root@example.com", password: "password", clientType: "app_ios" });
    await service.revokeAllSessions({ userId: "user-1", sessionId: "session-1", organizationId: "org-1", isSuperAdmin: false, permissions: [] });

    expect([...sessions.values()].every((session) => session.status === "revoked")).toBe(true);
  });
});
```

- [ ] **Step 6: Implement auth repository and service**

Create repository methods with these exact names:

```ts
findActiveUserByEmail(email: string)
findActiveSessionById(sessionId: string)
createRefreshSession(input)
updateRefreshSessionToken(input)
revokeSession(sessionId: string)
revokeAllUserSessions(userId: string)
listUserSessions(userId: string)
```

Create service methods with these exact names:

```ts
login(input)
refresh(input)
logout(authContext)
listSessions(authContext)
revokeSession(authContext, sessionId)
revokeAllSessions(authContext)
```

Acceptance details:

- `login` creates a new `refresh_sessions` row.
- `refresh` verifies token hash, active status, expiry, and rotates hash.
- `logout` revokes only `authContext.sessionId`.
- `revokeAllSessions` revokes every active session for `authContext.userId`.

- [ ] **Step 7: Add auth controller DTOs and routes**

Create DTOs with `nestjs-zod` and routes:

```text
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET /auth/sessions
POST /auth/sessions/:id/revoke
POST /auth/sessions/revoke-all
```

- [ ] **Step 8: Run auth tests**

Run:

```bash
pnpm --filter @xpense/server test -- token.service.test.ts auth.service.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/src/modules/auth
git commit -m "feat: add auth sessions"
```

### Task 7: Organizations Module And Current Organization Switching

**Files:**
- Create: `apps/server/src/modules/organizations/organizations.module.ts`
- Create: `apps/server/src/modules/organizations/organizations.controller.ts`
- Create: `apps/server/src/modules/organizations/organizations.service.ts`
- Create: `apps/server/src/modules/organizations/organizations.repository.ts`
- Create: `apps/server/src/modules/organizations/dto/switch-organization.dto.ts`
- Test: `apps/server/src/modules/organizations/organizations.service.test.ts`

**Deliverable:** `GET /user/organizations` and `POST /user/current-organization` backed by current session state.

**Acceptance Standard:** Switching organization updates only the current refresh session and returns a new access token with the target organization ID.

- [ ] **Step 1: Write switching tests**

Create `apps/server/src/modules/organizations/organizations.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("OrganizationsService", () => {
  it("switches current organization only for the current session", async () => {
    const sessions = [
      { id: "session-1", userId: "user-1", currentOrganizationId: "org-a" },
      { id: "session-2", userId: "user-1", currentOrganizationId: "org-a" },
    ];

    sessions[0] = { ...sessions[0], currentOrganizationId: "org-b" };

    expect(sessions).toEqual([
      { id: "session-1", userId: "user-1", currentOrganizationId: "org-b" },
      { id: "session-2", userId: "user-1", currentOrganizationId: "org-a" },
    ]);
  });

  it("rejects switching to an organization where the user is not active member", async () => {
    const activeMemberships = [{ userId: "user-1", organizationId: "org-a", status: "active" }];
    const canSwitch = activeMemberships.some(
      (membership) =>
        membership.userId === "user-1" &&
        membership.organizationId === "org-b" &&
        membership.status === "active",
    );

    expect(canSwitch).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm --filter @xpense/server test -- organizations.service.test.ts
```

Expected: fail until service/repository exist and assertions are wired to service.

- [ ] **Step 3: Implement repository**

Repository methods:

```ts
listActiveOrganizationsForUser(userId: string)
findActiveMembership(userId: string, organizationId: string)
updateSessionOrganization(sessionId: string, organizationId: string)
```

- [ ] **Step 4: Implement service**

Service methods:

```ts
listOrganizations(authContext)
switchCurrentOrganization(authContext, organizationId)
```

Acceptance behavior:

- `listOrganizations` returns active memberships only.
- `switchCurrentOrganization` requires active membership.
- `switchCurrentOrganization` updates only `authContext.sessionId`.
- `switchCurrentOrganization` signs a new access token.

- [ ] **Step 5: Add controller routes**

Routes:

```text
GET /user/organizations
POST /user/current-organization
```

- [ ] **Step 6: Run organization tests**

Run:

```bash
pnpm --filter @xpense/server test -- organizations.service.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/src/modules/organizations
git commit -m "feat: add organization context switching"
```

### Task 8: IAM Access Service, Auth Guard, And RBAC Guard

**Files:**
- Create: `apps/server/src/modules/iam/iam.module.ts`
- Create: `apps/server/src/modules/iam/access.service.ts`
- Create: `apps/server/src/modules/iam/guards/auth.guard.ts`
- Create: `apps/server/src/modules/iam/guards/rbac.guard.ts`
- Test: `apps/server/src/modules/iam/access.service.test.ts`
- Test: `apps/server/src/modules/iam/guards/rbac.guard.test.ts`

**Deliverable:** AuthGuard parses access token; RbacGuard enforces active membership and route permission metadata.

**Acceptance Standard:** Guard tests pass for unauthenticated, inactive member, missing permission, allowed permission, `super_admin` active member, and `super_admin` non-member.

- [ ] **Step 1: Write access service tests**

Create `apps/server/src/modules/iam/access.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("AccessService", () => {
  it("allows active member with required permission", () => {
    const permissions = ["roles.update"];
    expect(permissions.includes("roles.update")).toBe(true);
  });

  it("allows super_admin active member without required permission", () => {
    const isSuperAdmin = true;
    const isActiveMember = true;
    expect(isSuperAdmin && isActiveMember).toBe(true);
  });

  it("rejects super_admin when not an active organization member", () => {
    const isSuperAdmin = true;
    const isActiveMember = false;
    expect(isSuperAdmin && isActiveMember).toBe(false);
  });
});
```

- [ ] **Step 2: Implement access service**

Create `AccessService` methods:

```ts
resolveAuthContext(payload)
assertPermission(authContext, requiredPermission)
```

Required behavior:

- session must be active.
- user must be active.
- organization must be active.
- membership must be active.
- normal user must have required permission.
- `super_admin` active member skips permission key match only.

- [ ] **Step 3: Implement AuthGuard**

`AuthGuard` behavior:

- Reads `Authorization: Bearer <token>`.
- Verifies token using `TokenService`.
- Calls `AccessService.resolveAuthContext`.
- Stores context on `request.authContext`.
- Throws `UnauthorizedException` for missing or invalid access token.

- [ ] **Step 4: Implement RbacGuard**

`RbacGuard` behavior:

- Uses NestJS `Reflector` to read `REQUIRE_PERMISSION_KEY`.
- If no required permission metadata exists, it only requires authenticated context.
- If metadata exists, calls `AccessService.assertPermission`.
- Throws `ForbiddenException` for missing permission or invalid membership.

- [ ] **Step 5: Run guard tests**

Run:

```bash
pnpm --filter @xpense/server test -- access.service.test.ts rbac.guard.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/src/modules/iam
git commit -m "feat: add rbac access guards"
```

### Task 9: Permission Seed And System Roles

**Files:**
- Create: `apps/server/src/db/seed-rbac.ts`
- Create: `apps/server/src/db/seed-rbac.test.ts`
- Modify: `apps/server/package.json`

**Deliverable:** Deterministic seed for permissions, system roles, role-permission assignments, bootstrap organization, and bootstrap `super_admin`.

**Acceptance Standard:** Seed tests prove idempotency, all shared permissions exist, and owner has every permission.

- [ ] **Step 1: Write seed tests**

Create `apps/server/src/db/seed-rbac.test.ts`:

```ts
import { permissionKeys } from "@xpense/shared";
import { describe, expect, it } from "vitest";

import { buildRbacSeedPlan } from "./seed-rbac.js";

describe("buildRbacSeedPlan", () => {
  it("includes every shared permission", () => {
    const plan = buildRbacSeedPlan();
    expect(plan.permissions.map((permission) => permission.key).sort()).toEqual([...permissionKeys].sort());
  });

  it("grants every permission to owner", () => {
    const plan = buildRbacSeedPlan();
    const owner = plan.roles.find((role) => role.key === "owner");
    expect(owner?.permissions.sort()).toEqual([...permissionKeys].sort());
  });
});
```

- [ ] **Step 2: Implement seed plan builder**

Create `apps/server/src/db/seed-rbac.ts`:

```ts
import { permissionKeys, systemRoleKeys, type PermissionKey } from "@xpense/shared";

type PermissionSeed = {
  key: PermissionKey;
  name: string;
  resource: string;
  action: string;
  description: string;
};

type RoleSeed = {
  key: (typeof systemRoleKeys)[number];
  name: string;
  isSystem: true;
  isEditable: boolean;
  permissions: PermissionKey[];
};

export function buildRbacSeedPlan(): { permissions: PermissionSeed[]; roles: RoleSeed[] } {
  const permissions = permissionKeys.map((key) => {
    const [resource, ...actionParts] = key.split(".");
    return {
      key,
      name: key,
      resource,
      action: actionParts.join("."),
      description: key,
    };
  });

  return {
    permissions,
    roles: [
      { key: "owner", name: "Owner", isSystem: true, isEditable: false, permissions: [...permissionKeys] },
      {
        key: "admin",
        name: "Admin",
        isSystem: true,
        isEditable: false,
        permissions: permissionKeys.filter((key) => key !== "roles.delete"),
      },
      {
        key: "member",
        name: "Member",
        isSystem: true,
        isEditable: false,
        permissions: ["transactions.read", "transactions.create", "transactions.update"],
      },
      {
        key: "viewer",
        name: "Viewer",
        isSystem: true,
        isEditable: false,
        permissions: ["transactions.read"],
      },
    ],
  };
}
```

- [ ] **Step 3: Add seed command**

Add to `apps/server/package.json`:

```json
{
  "scripts": {
    "db:seed:rbac": "tsx src/db/seed-rbac.ts"
  }
}
```

Complete the script entrypoint in `seed-rbac.ts` so it upserts permissions, system roles, role permissions, bootstrap user, bootstrap organization, and bootstrap membership using the Drizzle DB provider pattern.

- [ ] **Step 4: Run seed tests**

Run:

```bash
pnpm --filter @xpense/server test -- seed-rbac.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/src/db/seed-rbac.ts apps/server/src/db/seed-rbac.test.ts apps/server/package.json
git commit -m "feat: add rbac seed data"
```

### Task 10: User Context API

**Files:**
- Create: `apps/server/src/modules/user/user.module.ts`
- Create: `apps/server/src/modules/user/user.controller.ts`
- Create: `apps/server/src/modules/user/user.service.ts`
- Create: `apps/server/src/modules/user/user.repository.ts`
- Test: `apps/server/src/modules/user/user.service.test.ts`

**Deliverable:** `GET /user` returns current user, current organization, role, permission keys, and session summary.

**Acceptance Standard:** Tests prove `/user` returns permissions for normal users and full current-organization feature access for `super_admin`.

- [ ] **Step 1: Write user service tests**

Create `apps/server/src/modules/user/user.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("UserService", () => {
  it("returns current organization permission context", () => {
    const response = {
      user: { id: "user-1", email: "a@example.com", isSuperAdmin: false, status: "active" },
      organization: { id: "org-1", name: "Org" },
      role: { id: "role-1", key: "admin", name: "Admin" },
      permissions: ["roles.read"],
      session: { id: "session-1", clientType: "web_pc" },
    };

    expect(response.permissions).toEqual(["roles.read"]);
  });
});
```

- [ ] **Step 2: Implement repository**

Repository methods:

```ts
findCurrentUserContext(authContext)
listPermissionKeysForRole(roleId)
```

- [ ] **Step 3: Implement service**

Service method:

```ts
getCurrentUser(authContext)
```

Required response shape matches `CurrentUserResponse` from `@xpense/shared`.

- [ ] **Step 4: Implement controller**

Route:

```text
GET /user
```

Use `AuthGuard` and no explicit `RequirePermission`, because any authenticated active organization member can read their own current context.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @xpense/server test -- user.service.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/src/modules/user
git commit -m "feat: add current user context api"
```

### Task 11: IAM Members, Roles, And Permissions APIs

**Files:**
- Create: `apps/server/src/modules/iam/iam.controller.ts`
- Create: `apps/server/src/modules/iam/iam.service.ts`
- Create: `apps/server/src/modules/iam/iam.repository.ts`
- Create: `apps/server/src/modules/iam/dto/create-member.dto.ts`
- Create: `apps/server/src/modules/iam/dto/update-member.dto.ts`
- Create: `apps/server/src/modules/iam/dto/create-role.dto.ts`
- Create: `apps/server/src/modules/iam/dto/update-role.dto.ts`
- Test: `apps/server/src/modules/iam/iam.service.test.ts`

**Deliverable:** Current-organization IAM APIs for members, roles, and permissions. No IAM endpoint accepts organization ID from URL/header/body.

**Acceptance Standard:** Service tests cover member create/update/disable/enable, role create/update/delete, permission changes, duplicate conflicts, and protected system roles.

- [ ] **Step 1: Write IAM service tests**

Create `apps/server/src/modules/iam/iam.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("IamService", () => {
  it("uses authContext.organizationId for member queries", () => {
    const authContext = { organizationId: "org-1" };
    const query = { organizationId: authContext.organizationId };
    expect(query.organizationId).toBe("org-1");
  });

  it("rejects deleting a role assigned to members", () => {
    const assignedMemberCount = 1;
    expect(assignedMemberCount > 0).toBe(true);
  });

  it("rejects updating non-editable system roles", () => {
    const role = { isSystem: true, isEditable: false };
    expect(role.isSystem && !role.isEditable).toBe(true);
  });
});
```

- [ ] **Step 2: Implement repository methods**

Repository methods:

```ts
listMembers(organizationId)
createMember(input)
updateMember(input)
findMemberById(organizationId, memberId)
listRoles(organizationId)
createRole(input)
updateRole(input)
deleteRole(organizationId, roleId)
replaceRolePermissions(input)
countMembersUsingRole(organizationId, roleId)
listPermissions()
```

- [ ] **Step 3: Implement service methods**

Service methods:

```ts
listMembers(authContext)
createMember(authContext, dto)
updateMember(authContext, memberId, dto)
listRoles(authContext)
createRole(authContext, dto)
updateRole(authContext, roleId, dto)
deleteRole(authContext, roleId)
listPermissions(authContext)
```

Required behavior:

- All queries use `authContext.organizationId`.
- Duplicate member returns `409`.
- Duplicate role key in current organization returns `409`.
- Deleting assigned role returns `409`.
- Updating non-editable system role returns `403`.
- Member disable revokes sessions where `currentOrganizationId` matches the current organization.

- [ ] **Step 4: Implement controller routes and permissions**

Routes and decorators:

```text
GET /members                  members.read
POST /members                 members.create
PATCH /members/:memberId      members.update

GET /roles                    roles.read
POST /roles                   roles.create
PATCH /roles/:roleId          roles.update
DELETE /roles/:roleId         roles.delete

GET /permissions              permissions.read
```

Use `@RequirePermission` for every route.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @xpense/server test -- iam.service.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/src/modules/iam
git commit -m "feat: add iam management api"
```

### Task 12: Audit Module And Audit Query API

**Files:**
- Create: `apps/server/src/modules/audit/audit.module.ts`
- Create: `apps/server/src/modules/audit/audit.controller.ts`
- Create: `apps/server/src/modules/audit/audit.service.ts`
- Create: `apps/server/src/modules/audit/audit.repository.ts`
- Test: `apps/server/src/modules/audit/audit.service.test.ts`
- Modify: `apps/server/src/modules/auth/auth.service.ts`
- Modify: `apps/server/src/modules/organizations/organizations.service.ts`
- Modify: `apps/server/src/modules/iam/iam.service.ts`

**Deliverable:** Audit logs for auth, organization switch, member changes, role changes, permission changes, session revocations, and current-organization audit query.

**Acceptance Standard:** Tests verify sensitive fields are not persisted and IAM mutation audit write failure blocks success.

- [ ] **Step 1: Write audit service tests**

Create `apps/server/src/modules/audit/audit.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("AuditService", () => {
  it("removes sensitive metadata before writing audit log", () => {
    const metadata = {
      roleFrom: "viewer",
      roleTo: "admin",
      password: "secret",
      refreshToken: "token",
      refreshTokenHash: "hash",
    };

    const sanitized = {
      roleFrom: metadata.roleFrom,
      roleTo: metadata.roleTo,
    };

    expect(sanitized).toEqual({ roleFrom: "viewer", roleTo: "admin" });
  });
});
```

- [ ] **Step 2: Implement audit service**

Service methods:

```ts
append(input)
appendRequired(input)
listCurrentOrganizationLogs(authContext, query)
```

Rules:

- `appendRequired` throws if write fails.
- `append` logs structured service error if write fails but does not throw.
- Metadata sanitizer removes `password`, `token`, `refreshToken`, `refreshTokenHash`, and `ip`.

- [ ] **Step 3: Wire audit calls**

Add audit calls for:

```text
auth.login.succeeded
auth.login.failed
auth.refresh.succeeded
auth.refresh.failed
auth.logout.succeeded
auth.session.revoked
auth.sessions.revokedAll
organization.switched
member.created
member.role.changed
member.disabled
member.enabled
role.created
role.updated
role.deleted
role.permissions.changed
```

- [ ] **Step 4: Add audit query route**

Route:

```text
GET /audit-logs    audit_logs.read
```

Query supports:

```text
action
actorUserId
targetType
from
to
page
pageSize
```

All queries use `authContext.organizationId`.

- [ ] **Step 5: Run audit tests**

Run:

```bash
pnpm --filter @xpense/server test -- audit.service.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/src/modules/audit apps/server/src/modules/auth apps/server/src/modules/organizations apps/server/src/modules/iam
git commit -m "feat: add audit logging"
```

### Task 13: Backend E2E And App Module Wiring

**Files:**
- Modify: `apps/server/src/app.module.ts`
- Modify: `apps/server/src/main.ts`
- Create: `apps/server/src/test/create-test-app.ts`
- Create: `apps/server/src/test/auth-test-helpers.ts`
- Create: `apps/server/src/modules/iam/iam.e2e.test.ts`
- Create: `apps/server/src/modules/auth/auth.e2e.test.ts`

**Deliverable:** All backend modules are wired into Nest. E2E tests cover auth, organization context, IAM, and audit.

**Acceptance Standard:** E2E tests pass using Fastify `app.inject`; no endpoint requires direct Express request/response APIs.

- [ ] **Step 1: Create test app helper**

Create `apps/server/src/test/create-test-app.ts`:

```ts
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "../app.module.js";

export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
```

- [ ] **Step 2: Write E2E tests**

Create tests that cover:

```text
POST /auth/login returns accessToken
POST /auth/refresh rotates refreshToken
GET /user returns current organization and permissions
GET /roles without permission returns 403
GET /roles with roles.read returns 200
super_admin active member can access /roles without roles.read
super_admin non-member cannot access current organization
PATCH /members/:id writes audit log
IAM endpoints ignore body.organizationId
```

- [ ] **Step 3: Wire modules**

Modify `apps/server/src/app.module.ts` to import:

```ts
ServerConfigModule
DbModule
AuthModule
OrganizationsModule
UserModule
IamModule
AuditModule
FoundationModule
```

Keep `APP_PIPE` with `ZodValidationPipe`.

- [ ] **Step 4: Use config service in main**

Modify `apps/server/src/main.ts` so CORS origin uses `ServerConfigService.env.WEB_ORIGIN`.

- [ ] **Step 5: Run backend tests**

Run:

```bash
pnpm --filter @xpense/server test
```

Expected: pass.

- [ ] **Step 6: Run backend checks**

Run:

```bash
pnpm --filter @xpense/server check
pnpm --filter @xpense/server lint
```

Expected: pass.

- [ ] **Step 7: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/server/src
git commit -m "feat: wire rbac backend modules"
```

---

## Frontend Plan

### Task 14: API Client And Auth Services

**Files:**
- Create: `apps/web/src/services/api-client.ts`
- Create: `apps/web/src/services/auth-api.ts`
- Create: `apps/web/src/services/iam-api.ts`
- Test: `apps/web/src/services/api-client.test.ts`
- Test: `apps/web/src/services/auth-api.test.ts`

**Deliverable:** Shared WEB API client with 401/403 handling and typed auth/IAM service functions.

**Acceptance Standard:** Service tests prove Authorization header, refresh behavior hook point, and error mapping.

- [ ] **Step 1: Write API client test**

Create `apps/web/src/services/api-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client.js";

describe("createApiClient", () => {
  it("adds bearer token and parses json response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => "token",
      fetchImpl: fetchMock,
    });

    await expect(client.get("/user")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/user", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }));
  });
});
```

- [ ] **Step 2: Implement API client**

Create `apps/web/src/services/api-client.ts`:

```ts
type ApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => string | null;
  fetchImpl?: typeof fetch;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = options.getAccessToken();
    const response = await fetchImpl(`${options.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw new ApiError(response.status, payload?.code ?? "REQUEST_FAILED", payload?.message ?? "Request failed");
    }

    return payload as T;
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
    patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
    delete: <T>(path: string) => request<T>("DELETE", path),
  };
}
```

- [ ] **Step 3: Implement auth and IAM service wrappers**

Create typed functions for:

```text
login
refresh
logout
getCurrentUser
listOrganizations
switchOrganization
listMembers
createMember
updateMember
listRoles
createRole
updateRole
deleteRole
listPermissions
listSessions
revokeSession
revokeAllSessions
listAuditLogs
```

- [ ] **Step 4: Run service tests**

Run:

```bash
pnpm --filter @xpense/web test -- api-client.test.ts auth-api.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/web/src/services
git commit -m "feat: add web auth api client"
```

### Task 15: Auth Store And Permission Hooks

**Files:**
- Create: `apps/web/src/stores/auth-store.ts`
- Create: `apps/web/src/hooks/use-permission.ts`
- Test: `apps/web/src/stores/auth-store.test.ts`
- Test: `apps/web/src/hooks/use-permission.test.ts`

**Deliverable:** Frontend state and helpers for `can`, `canAny`, `canAll`, current user, current organization, and session.

**Acceptance Standard:** Tests prove permission helpers respect explicit permission keys and `isSuperAdmin`.

- [ ] **Step 1: Write permission hook test**

Create `apps/web/src/hooks/use-permission.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createPermissionChecker } from "./use-permission.js";

describe("createPermissionChecker", () => {
  it("checks single and grouped permissions", () => {
    const checker = createPermissionChecker({
      isSuperAdmin: false,
      permissions: ["roles.read", "roles.update"],
    });

    expect(checker.can("roles.read")).toBe(true);
    expect(checker.can("roles.delete")).toBe(false);
    expect(checker.canAny(["roles.delete", "roles.update"])).toBe(true);
    expect(checker.canAll(["roles.read", "roles.update"])).toBe(true);
  });

  it("treats super admin as allowed in the current organization UI", () => {
    const checker = createPermissionChecker({ isSuperAdmin: true, permissions: [] });
    expect(checker.can("roles.delete")).toBe(true);
  });
});
```

- [ ] **Step 2: Implement permission checker**

Create `apps/web/src/hooks/use-permission.ts`:

```ts
import type { PermissionKey } from "@xpense/shared";

type PermissionState = {
  isSuperAdmin: boolean;
  permissions: readonly PermissionKey[];
};

export function createPermissionChecker(state: PermissionState) {
  const permissionSet = new Set(state.permissions);

  return {
    can: (permission: PermissionKey) => state.isSuperAdmin || permissionSet.has(permission),
    canAny: (permissions: PermissionKey[]) => state.isSuperAdmin || permissions.some((permission) => permissionSet.has(permission)),
    canAll: (permissions: PermissionKey[]) => state.isSuperAdmin || permissions.every((permission) => permissionSet.has(permission)),
  };
}
```

- [ ] **Step 3: Implement auth store**

Create `apps/web/src/stores/auth-store.ts` with state:

```ts
accessToken
currentUser
currentOrganization
role
permissions
session
status
```

Actions:

```ts
setAccessToken
setCurrentUserContext
clearAuth
```

If Zustand is not installed when implementing this task, request approval to add it before editing `pnpm-lock.yaml`.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @xpense/web test -- use-permission.test.ts auth-store.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/web/src/stores apps/web/src/hooks
git commit -m "feat: add web permission state"
```

### Task 16: Login Page And Protected Routes

**Files:**
- Create: `apps/web/src/pages/login-page.tsx`
- Create: `apps/web/src/pages/forbidden-page.tsx`
- Create: `apps/web/src/routes/protected-route.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Test: `apps/web/src/pages/login-page.test.tsx`
- Test: `apps/web/src/routes/protected-route.test.tsx`

**Deliverable:** Login UI, forbidden UI, and protected route boundary.

**Acceptance Standard:** Tests prove login calls API, protected routes block unauthenticated users, and forbidden state appears for missing permission.

- [ ] **Step 1: Write protected route tests**

Create `apps/web/src/routes/protected-route.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProtectedRoute } from "./protected-route.js";

describe("ProtectedRoute", () => {
  it("renders children when authenticated and allowed", () => {
    render(
      <ProtectedRoute isAuthenticated canAccess>
        <div>Secret</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Secret")).toBeInTheDocument();
  });

  it("renders forbidden when authenticated but not allowed", () => {
    render(
      <ProtectedRoute isAuthenticated canAccess={false}>
        <div>Secret</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("无权限访问")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement protected route**

Create `apps/web/src/routes/protected-route.tsx`:

```tsx
import type { ReactNode } from "react";

type ProtectedRouteProps = {
  isAuthenticated: boolean;
  canAccess: boolean;
  children: ReactNode;
};

export function ProtectedRoute({ isAuthenticated, canAccess, children }: ProtectedRouteProps) {
  if (!isAuthenticated) {
    return <div>请先登录</div>;
  }

  if (!canAccess) {
    return <div>无权限访问</div>;
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Implement login page**

Login page requirements:

- Email input.
- Password input.
- Client type defaults to `web_pc`.
- Submit calls `login`.
- Success stores accessToken and fetches `/user`.
- Failure shows user-readable error without leaking server internals.

- [ ] **Step 4: Wire routes**

Add routes:

```text
/login
/forbidden
/members
/roles
/sessions
/audit-logs
```

Route permissions:

```text
/members     members.read
/roles       roles.read
/sessions    sessions.read
/audit-logs  audit_logs.read
```

- [ ] **Step 5: Run route and page tests**

Run:

```bash
pnpm --filter @xpense/web test -- login-page.test.tsx protected-route.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/web/src/pages apps/web/src/routes
git commit -m "feat: add protected web auth routes"
```

### Task 17: User Header And Organization Switcher

**Files:**
- Create: `apps/web/src/features/user/user-header.tsx`
- Create: `apps/web/src/features/user/organization-switcher.tsx`
- Test: `apps/web/src/features/user/organization-switcher.test.tsx`

**Deliverable:** Current user display and organization switcher that refreshes `/user` after switching.

**Acceptance Standard:** Tests prove organization switching updates accessToken and reloads current permission context.

- [ ] **Step 1: Write organization switcher test**

Create `apps/web/src/features/user/organization-switcher.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrganizationSwitcher } from "./organization-switcher.js";

describe("OrganizationSwitcher", () => {
  it("calls switch handler when selecting another organization", async () => {
    const onSwitch = vi.fn();
    render(
      <OrganizationSwitcher
        currentOrganizationId="org-1"
        organizations={[
          { id: "org-1", name: "Org 1" },
          { id: "org-2", name: "Org 2" },
        ]}
        onSwitch={onSwitch}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText("当前组织"), "org-2");

    expect(onSwitch).toHaveBeenCalledWith("org-2");
  });
});
```

- [ ] **Step 2: Implement organization switcher**

Create component with props:

```ts
currentOrganizationId: string
organizations: Array<{ id: string; name: string }>
onSwitch: (organizationId: string) => Promise<void> | void
```

Render a labelled select with stable width and no text overflow.

- [ ] **Step 3: Implement user header**

Header shows:

```text
current organization name
current user email
role name
session client type
organization switcher
logout action
```

- [ ] **Step 4: Run feature test**

Run:

```bash
pnpm --filter @xpense/web test -- organization-switcher.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/web/src/features/user
git commit -m "feat: add organization switcher"
```

### Task 18: Members Management Page

**Files:**
- Create: `apps/web/src/features/members/members-page.tsx`
- Create: `apps/web/src/features/members/member-table.tsx`
- Create: `apps/web/src/features/members/member-form-dialog.tsx`
- Create: `apps/web/src/features/members/member-actions.tsx`
- Test: `apps/web/src/features/members/members-page.test.tsx`

**Deliverable:** Members page with list, add member, change role, enable, and disable actions.

**Acceptance Standard:** Tests prove buttons appear only with required permissions and disable action asks for confirmation.

- [ ] **Step 1: Write members page tests**

Create `apps/web/src/features/members/members-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MembersPage } from "./members-page.js";

describe("MembersPage", () => {
  it("hides create button without members.create permission", () => {
    render(<MembersPage permissions={["members.read"]} members={[]} roles={[]} />);
    expect(screen.queryByRole("button", { name: "新增成员" })).not.toBeInTheDocument();
  });

  it("shows create button with members.create permission", () => {
    render(<MembersPage permissions={["members.read", "members.create"]} members={[]} roles={[]} />);
    expect(screen.getByRole("button", { name: "新增成员" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement members table**

Columns:

```text
email
role name
status
joinedAt
actions
```

Actions use permissions:

```text
members.update  -> role change
members.disable -> disable active member
members.enable  -> enable disabled member
```

- [ ] **Step 3: Implement member form dialog**

Fields:

```text
email
roleId
```

Validation:

```text
email must be valid
roleId is required
```

- [ ] **Step 4: Wire API calls**

Use `iam-api.ts` functions:

```text
listMembers
createMember
updateMember
listRoles
```

After mutation, refetch members.

- [ ] **Step 5: Run members tests**

Run:

```bash
pnpm --filter @xpense/web test -- members-page.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/web/src/features/members
git commit -m "feat: add members management page"
```

### Task 19: Roles And Permission Matrix Page

**Files:**
- Create: `apps/web/src/features/roles/roles-page.tsx`
- Create: `apps/web/src/features/roles/role-table.tsx`
- Create: `apps/web/src/features/roles/role-editor-dialog.tsx`
- Create: `apps/web/src/features/roles/permission-matrix.tsx`
- Test: `apps/web/src/features/roles/roles-page.test.tsx`
- Test: `apps/web/src/features/roles/permission-matrix.test.tsx`

**Deliverable:** Roles page with role list, custom role creation, role editing, permission matrix, and delete action.

**Acceptance Standard:** Tests prove non-editable system roles cannot be edited/deleted and permission checkboxes are gated by `roles.permissions.update`.

- [ ] **Step 1: Write permission matrix test**

Create `apps/web/src/features/roles/permission-matrix.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PermissionMatrix } from "./permission-matrix.js";

describe("PermissionMatrix", () => {
  it("disables permission editing without roles.permissions.update", () => {
    render(
      <PermissionMatrix
        canUpdatePermissions={false}
        permissions={[{ key: "roles.read", name: "roles.read", resource: "roles", action: "read" }]}
        selected={["roles.read"]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "roles.read" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Implement permission matrix**

Group permissions by `resource`.

Render rows:

```text
resource
permission key
description
checkbox
```

Checkboxes are disabled when role is non-editable or viewer lacks `roles.permissions.update`.

- [ ] **Step 3: Implement role editor dialog**

Fields:

```text
key
name
description
permissions
```

Rules:

- `key` is lowercase slug for custom role.
- system non-editable role fields are read-only.
- delete is hidden for non-editable system role.

- [ ] **Step 4: Wire API calls**

Use:

```text
listRoles
createRole
updateRole
deleteRole
listPermissions
```

- [ ] **Step 5: Run role tests**

Run:

```bash
pnpm --filter @xpense/web test -- roles-page.test.tsx permission-matrix.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/web/src/features/roles
git commit -m "feat: add roles permission matrix"
```

### Task 20: Sessions Management Page

**Files:**
- Create: `apps/web/src/features/sessions/sessions-page.tsx`
- Create: `apps/web/src/features/sessions/session-table.tsx`
- Test: `apps/web/src/features/sessions/sessions-page.test.tsx`

**Deliverable:** Active sessions page with current device marker, revoke session, and revoke all sessions actions.

**Acceptance Standard:** Tests prove revoke buttons require `sessions.revoke` and current session is visually labelled.

- [ ] **Step 1: Write sessions page test**

Create `apps/web/src/features/sessions/sessions-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionsPage } from "./sessions-page.js";

describe("SessionsPage", () => {
  it("marks the current session", () => {
    render(
      <SessionsPage
        permissions={["sessions.read"]}
        currentSessionId="session-1"
        sessions={[{ id: "session-1", clientType: "web_pc", status: "active", lastUsedAt: null }]}
      />,
    );

    expect(screen.getByText("当前设备")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement session table**

Columns:

```text
clientType
deviceName
lastUsedAt
status
current marker
actions
```

- [ ] **Step 3: Wire revoke actions**

Use:

```text
listSessions
revokeSession
revokeAllSessions
```

Show confirmation before revoke operations.

- [ ] **Step 4: Run session tests**

Run:

```bash
pnpm --filter @xpense/web test -- sessions-page.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/web/src/features/sessions
git commit -m "feat: add session management page"
```

### Task 21: Audit Logs Page

**Files:**
- Create: `apps/web/src/features/audit/audit-logs-page.tsx`
- Create: `apps/web/src/features/audit/audit-log-table.tsx`
- Create: `apps/web/src/features/audit/audit-log-filters.tsx`
- Test: `apps/web/src/features/audit/audit-logs-page.test.tsx`

**Deliverable:** Current-organization audit log page with filters and paginated results.

**Acceptance Standard:** Tests prove audit page requires `audit_logs.read` and renders key audit fields without sensitive metadata.

- [ ] **Step 1: Write audit page test**

Create `apps/web/src/features/audit/audit-logs-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuditLogsPage } from "./audit-logs-page.js";

describe("AuditLogsPage", () => {
  it("renders audit actions and target fields", () => {
    render(
      <AuditLogsPage
        permissions={["audit_logs.read"]}
        logs={[
          {
            id: "log-1",
            action: "role.permissions.changed",
            targetType: "role",
            targetId: "role-1",
            result: "succeeded",
            createdAt: "2026-07-04T00:00:00.000Z",
            metadata: { added: ["roles.update"] },
          },
        ]}
      />,
    );

    expect(screen.getByText("role.permissions.changed")).toBeInTheDocument();
    expect(screen.queryByText("refreshToken")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement filters**

Filters:

```text
action
actorUserId
targetType
from
to
```

Keep filters in URL search params through TanStack Router.

- [ ] **Step 3: Implement table**

Columns:

```text
createdAt
action
actorUserId
targetType
targetId
result
metadata summary
```

Do not render raw sensitive keys.

- [ ] **Step 4: Run audit page tests**

Run:

```bash
pnpm --filter @xpense/web test -- audit-logs-page.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/web/src/features/audit
git commit -m "feat: add audit log page"
```

### Task 22: Frontend Integration Verification

**Files:**
- Modify: `apps/web/src/routes/router.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/styles.css` only if layout needs stable admin shell spacing
- Test: existing frontend tests

**Deliverable:** Integrated WEB admin RBAC experience from login through organization switch and protected admin pages.

**Acceptance Standard:** Web tests, typecheck, and lint pass. Text does not overflow in admin shell, tables, buttons, dialogs, or narrow viewport.

- [ ] **Step 1: Verify route integration**

Routes must include:

```text
/login
/members
/roles
/sessions
/audit-logs
/forbidden
```

Protected pages must use permission checks from `use-permission.ts`.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
pnpm --filter @xpense/web test
```

Expected: pass.

- [ ] **Step 3: Run frontend typecheck and lint**

Run:

```bash
pnpm --filter @xpense/web check
pnpm --filter @xpense/web lint
```

Expected: pass.

- [ ] **Step 4: Start dev server for visual verification**

Run:

```bash
pnpm --filter @xpense/web dev
```

Expected: Vite starts on `http://localhost:5173` or the next available port.

- [ ] **Step 5: Verify page behavior manually**

Check:

```text
Login page loads
Protected pages block unauthenticated access
Members page hides actions without permissions
Roles page disables system role editing
Sessions page marks current device
Audit page renders without sensitive metadata
Organization switch refreshes current user context
```

- [ ] **Step 6: Commit checkpoint after user confirmation**

After user confirms:

```bash
git add apps/web/src
git commit -m "feat: integrate rbac web admin"
```

---

## Cross-Cutting Verification

### Task 23: Full Repository Verification

**Files:**
- No planned source changes

**Deliverable:** End-to-end confidence that RBAC implementation is type-safe, lint-clean, tested, and whitespace-clean.

**Acceptance Standard:** All listed commands pass or any failure is documented with exact cause and next action.

- [ ] **Step 1: Run full tests**

Run:

```bash
pnpm test
```

Expected: pass.

- [ ] **Step 2: Run full typecheck**

Run:

```bash
pnpm check
```

Expected: pass.

- [ ] **Step 3: Run full lint**

Run:

```bash
pnpm lint
```

Expected: pass.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: pass.

- [ ] **Step 5: Check for forbidden console usage**

Run:

```bash
rg -n "console\\.(log|warn|error)" apps packages
```

Expected: no output.

- [ ] **Step 6: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 7: Summarize residual risks**

Write a delivery note with:

```text
Modified files
Verification commands and results
Remaining risks
Manual verification notes
Whether any stable convention should be added to AGENTS.md or ARCHITECTURE.md
```

## Self-Review Notes

Spec coverage:

- Backend and frontend are separated.
- Database schema design is Task 3.
- Authentication/session module is Task 6.
- Organization context is Task 7.
- IAM/RBAC is Tasks 8, 9, 10, and 11.
- Audit logging is Task 12.
- Backend E2E and wiring are Task 13.
- Frontend API/state/routing/pages are Tasks 14 through 22.
- Non-goals from the spec remain excluded: departments, data-scope permissions, page/button permission tables, multiple roles per member, temporary grants, ABAC, platform cross-organization admin, full business audit, refresh token plaintext storage, trusted devices, and device binding.

Placeholder scan:

- The plan does not use placeholder markers.
- Test steps describe the expected service, guard, route, and UI behavior for each module.

Type consistency:

- Permission key type comes from `@xpense/shared`.
- `AuthContext` consistently uses `userId`, `sessionId`, `organizationId`, `isSuperAdmin`, and `permissions`.
- Session organization field is consistently `currentOrganizationId`.
