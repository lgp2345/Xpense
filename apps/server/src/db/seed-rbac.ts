import { pathToFileURL } from "node:url";
import { type PermissionKey, permissionKeys, type SystemRoleKey } from "@xpense/shared";
import argon2 from "argon2";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseServerEnv, type ServerEnv } from "../config/env.schema.js";
import {
  copyMenuTemplate,
  type MenuTemplateExecutor,
  type MenuTemplateInsert,
} from "../modules/iam/menu-template.js";
import {
  type BookkeepingDefaultsContext,
  initializeBookkeepingDefaults,
} from "./bookkeeping-defaults.js";
import { createBookkeepingDefaultsExecutor } from "./bookkeeping-defaults-executor.js";
import {
  menus,
  organizationMemberships,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users,
} from "./schema.js";

type SeedDb = ReturnType<typeof drizzle>;
type SeedTransaction = Parameters<Parameters<SeedDb["transaction"]>[0]>[0];
type SeedExecutor = SeedDb | SeedTransaction;

/** bootstrap 种子流程解析出的组织与操作者。 */
export type BootstrapSeedResult = {
  organization: { id: string; created: boolean };
  actorUserId: string;
};

export type PermissionSeed = {
  key: PermissionKey;
  name: string;
  resource: string;
  action: string;
  description: string;
};

export type RoleSeed = {
  key: SystemRoleKey;
  name: string;
  isSystem: true;
  isEditable: boolean;
  permissions: PermissionKey[];
};

export type RbacSeedPlan = {
  permissions: PermissionSeed[];
  roles: RoleSeed[];
};

/** seedRbac 事务工作流中可替换的最小业务依赖。 */
export type SeedRbacWorkflowDependencies<TExecutor> = {
  /** 在当前事务中写入权限、角色及角色权限，并返回角色 ID 映射。 */
  prepareRbac(executor: TExecutor, plan: RbacSeedPlan): Promise<Map<SystemRoleKey, string>>;
  /** 在当前事务中解析或创建 bootstrap 组织与操作者。 */
  resolveBootstrap(
    executor: TExecutor,
    env: ServerEnv,
    roleIdByKey: Map<SystemRoleKey, string>,
  ): Promise<BootstrapSeedResult | undefined>;
  /** 在当前事务中幂等补齐 bootstrap 组织的默认记账数据。 */
  initializeDefaults(executor: TExecutor, context: BookkeepingDefaultsContext): Promise<void>;
  /** 在当前事务中为本次新建的 bootstrap 组织复制菜单模板。 */
  initializeMenu(executor: TExecutor, organizationId: string): Promise<void>;
};

/**
 * 根据共享权限词表构建稳定的系统角色授权计划。
 *
 * @returns 包含全部权限元数据及 owner、admin、member、viewer 精确授权的计划。
 */
export function buildRbacSeedPlan(): RbacSeedPlan {
  const permissions = permissionKeys.map((key) => {
    const [resource, ...actionParts] = key.split(":");

    return {
      key,
      name: key,
      resource: resource ?? key,
      action: actionParts.join("."),
      description: key,
    };
  });

  return {
    permissions,
    roles: [
      {
        key: "owner",
        name: "Owner",
        isSystem: true,
        isEditable: false,
        permissions: [...permissionKeys],
      },
      {
        key: "admin",
        name: "Admin",
        isSystem: true,
        isEditable: false,
        permissions: permissionKeys.filter((key) => key !== "roles:delete"),
      },
      {
        key: "member",
        name: "Member",
        isSystem: true,
        isEditable: false,
        permissions: [
          "dashboard:read",
          "ledgers:read",
          "accounts:read",
          "categories:read",
          "transactions:read",
          "transactions:create",
          "transactions:update",
          "statistics:read",
          "rental_properties:read",
          "rental_spaces:read",
        ],
      },
      {
        key: "viewer",
        name: "Viewer",
        isSystem: true,
        isEditable: false,
        permissions: [
          "dashboard:read",
          "ledgers:read",
          "accounts:read",
          "categories:read",
          "transactions:read",
          "statistics:read",
          "rental_properties:read",
          "rental_spaces:read",
        ],
      },
    ],
  };
}

/**
 * 在单个数据库事务内初始化 RBAC、bootstrap 组织及其默认业务数据。
 *
 * @param db 能开启事务并将事务 executor 交给回调的数据库入口。
 * @param env 已校验的服务端环境配置。
 * @param dependencies 可选的事务工作流依赖；生产环境省略时使用真实数据库实现。
 * @returns seed 完成后无返回值。
 * @throws 任一工作流步骤失败时传播异常并由数据库回滚整个事务。
 * @remarks defaults 与菜单均接收事务回调提供的 executor，不使用事务外数据库实例。
 */
export async function seedRbac<TExecutor = SeedTransaction>(
  db: { transaction(callback: (executor: TExecutor) => Promise<void>): Promise<void> },
  env: ServerEnv,
  dependencies?: SeedRbacWorkflowDependencies<TExecutor>,
): Promise<void> {
  const plan = buildRbacSeedPlan();
  const workflow =
    dependencies ??
    (defaultSeedRbacWorkflowDependencies as unknown as SeedRbacWorkflowDependencies<TExecutor>);

  await db.transaction(async (tx) => {
    const roleIdByKey = await workflow.prepareRbac(tx, plan);
    const bootstrap = await workflow.resolveBootstrap(tx, env, roleIdByKey);

    if (bootstrap) {
      await workflow.initializeDefaults(tx, {
        organizationId: bootstrap.organization.id,
        actorUserId: bootstrap.actorUserId,
      });
    }

    if (bootstrap && shouldInitializeMenuTemplate(bootstrap.organization.created)) {
      await workflow.initializeMenu(tx, bootstrap.organization.id);
    }
  });
}

export function shouldInitializeMenuTemplate(organizationWasCreated: boolean): boolean {
  return organizationWasCreated;
}

/** seedRbac 在生产环境使用的真实事务工作流依赖。 */
const defaultSeedRbacWorkflowDependencies: SeedRbacWorkflowDependencies<SeedTransaction> = {
  prepareRbac: prepareRbacSeed,
  resolveBootstrap: seedBootstrapData,
  async initializeDefaults(executor, context) {
    await initializeBookkeepingDefaults(createBookkeepingDefaultsExecutor(executor), context);
  },
  async initializeMenu(executor, organizationId) {
    await copyMenuTemplate(organizationId, createMenuTemplateExecutor(executor));
  },
};

export async function runSeedRbacFromProcessEnv(
  envInput: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const env = parseServerEnv(envInput);
  const client = postgres(env.DATABASE_URL);
  const db = drizzle({ client });

  try {
    await seedRbac(db, env);
  } finally {
    await client.end();
  }
}

/**
 * 在当前事务中写入权限、系统角色及角色权限关系。
 *
 * @param db seedRbac 事务回调提供的数据库 executor。
 * @param plan 当前稳定的权限与角色计划。
 * @returns 从系统角色 key 到持久化角色 ID 的映射。
 * @throws 权限或角色写入失败、角色或权限 ID 无法解析时传播异常。
 * @remarks 本函数不自行开启或提交事务，全部写入沿用调用方传入的事务 executor。
 */
async function prepareRbacSeed(
  db: SeedExecutor,
  plan: RbacSeedPlan,
): Promise<Map<SystemRoleKey, string>> {
  const permissionIdByKey = await upsertPermissions(db, plan.permissions);
  const roleIdByKey = await upsertSystemRoles(db, plan.roles);

  for (const role of plan.roles) {
    const roleId = roleIdByKey.get(role.key);

    if (!roleId) {
      throw new Error(`Missing seeded role: ${role.key}`);
    }

    await replaceRolePermissions(db, roleId, role.permissions, permissionIdByKey);
  }

  return roleIdByKey;
}

async function upsertPermissions(
  db: SeedExecutor,
  permissionSeeds: PermissionSeed[],
): Promise<Map<PermissionKey, string>> {
  await db
    .insert(permissions)
    .values(permissionSeeds)
    .onConflictDoUpdate({
      target: permissions.key,
      set: {
        name: permissions.name,
        resource: permissions.resource,
        action: permissions.action,
        description: permissions.description,
      },
    });

  const rows = await db
    .select({
      id: permissions.id,
      key: permissions.key,
    })
    .from(permissions)
    .where(inArray(permissions.key, [...permissionKeys]));

  return new Map(rows.map((row) => [row.key as PermissionKey, row.id]));
}

async function upsertSystemRoles(
  db: SeedExecutor,
  roleSeeds: RoleSeed[],
): Promise<Map<SystemRoleKey, string>> {
  const roleIdByKey = new Map<SystemRoleKey, string>();

  for (const role of roleSeeds) {
    const [existingRole] = await db
      .select({
        id: roles.id,
      })
      .from(roles)
      .where(and(isNull(roles.organizationId), eq(roles.key, role.key)))
      .limit(1);

    if (existingRole) {
      await db
        .update(roles)
        .set({
          name: role.name,
          description: role.name,
          isSystem: role.isSystem,
          isEditable: role.isEditable,
          updatedAt: new Date(),
        })
        .where(eq(roles.id, existingRole.id));
      roleIdByKey.set(role.key, existingRole.id);
      continue;
    }

    const [insertedRole] = await db
      .insert(roles)
      .values({
        organizationId: null,
        key: role.key,
        name: role.name,
        description: role.name,
        isSystem: role.isSystem,
        isEditable: role.isEditable,
      })
      .returning({ id: roles.id });

    if (!insertedRole) {
      throw new Error(`Failed to seed system role: ${role.key}`);
    }

    roleIdByKey.set(role.key, insertedRole.id);
  }

  return roleIdByKey;
}

async function replaceRolePermissions(
  db: SeedExecutor,
  roleId: string,
  rolePermissionKeys: PermissionKey[],
  permissionIdByKey: Map<PermissionKey, string>,
): Promise<void> {
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

  const values = rolePermissionKeys.map((permissionKey) => {
    const permissionId = permissionIdByKey.get(permissionKey);

    if (!permissionId) {
      throw new Error(`Missing seeded permission: ${permissionKey}`);
    }

    return {
      roleId,
      permissionId,
    };
  });

  if (values.length === 0) {
    return;
  }

  await db.insert(rolePermissions).values(values).onConflictDoNothing();
}

async function seedBootstrapData(
  db: SeedExecutor,
  env: ServerEnv,
  roleIdByKey: Map<SystemRoleKey, string>,
): Promise<BootstrapSeedResult | undefined> {
  if (
    !env.BOOTSTRAP_SUPER_ADMIN_EMAIL ||
    !env.BOOTSTRAP_SUPER_ADMIN_PHONE ||
    !env.BOOTSTRAP_SUPER_ADMIN_PASSWORD ||
    !env.BOOTSTRAP_ORGANIZATION_NAME
  ) {
    return undefined;
  }

  const superAdminUserId = await upsertBootstrapUser(
    db,
    env.BOOTSTRAP_SUPER_ADMIN_EMAIL,
    env.BOOTSTRAP_SUPER_ADMIN_PHONE,
    env.BOOTSTRAP_SUPER_ADMIN_PASSWORD,
  );
  const bootstrapOrganization = await ensureBootstrapOrganization(
    db,
    env.BOOTSTRAP_ORGANIZATION_NAME,
    superAdminUserId,
  );
  const ownerRoleId = roleIdByKey.get("owner");

  if (!ownerRoleId) {
    throw new Error("Missing owner role for bootstrap membership");
  }

  await db
    .insert(organizationMemberships)
    .values({
      organizationId: bootstrapOrganization.id,
      userId: superAdminUserId,
      roleId: ownerRoleId,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [organizationMemberships.organizationId, organizationMemberships.userId],
      set: {
        roleId: ownerRoleId,
        status: "active",
        updatedAt: new Date(),
      },
    });

  return {
    organization: bootstrapOrganization,
    actorUserId: superAdminUserId,
  };
}

async function upsertBootstrapUser(
  db: SeedExecutor,
  email: string,
  phone: string,
  password: string,
): Promise<string> {
  const [existingUser] = await db
    .select({
      id: users.id,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    await db
      .update(users)
      .set({
        status: "active",
        isSuperAdmin: true,
        phone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));

    return existingUser.id;
  }

  const [insertedUser] = await db
    .insert(users)
    .values({
      email,
      phone,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      status: "active",
      isSuperAdmin: true,
    })
    .returning({ id: users.id });

  if (!insertedUser) {
    throw new Error(`Failed to seed bootstrap user: ${email}`);
  }

  return insertedUser.id;
}

async function ensureBootstrapOrganization(
  db: SeedExecutor,
  name: string,
  createdByUserId: string,
): Promise<{ id: string; created: boolean }> {
  const [existingOrganization] = await db
    .select({
      id: organizations.id,
    })
    .from(organizations)
    .where(and(eq(organizations.name, name), eq(organizations.createdByUserId, createdByUserId)))
    .limit(1);

  if (existingOrganization) {
    await db
      .update(organizations)
      .set({
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, existingOrganization.id));

    return { id: existingOrganization.id, created: false };
  }

  const [insertedOrganization] = await db
    .insert(organizations)
    .values({
      name,
      status: "active",
      createdByUserId,
    })
    .returning({ id: organizations.id });

  if (!insertedOrganization) {
    throw new Error(`Failed to seed bootstrap organization: ${name}`);
  }

  return { id: insertedOrganization.id, created: true };
}

function createMenuTemplateExecutor(db: SeedExecutor): MenuTemplateExecutor {
  return {
    async insertMenu(input: MenuTemplateInsert): Promise<number> {
      const [insertedMenu] = await db.insert(menus).values(input).returning({ id: menus.id });

      if (!insertedMenu) {
        throw new Error(`Failed to seed menu template node: ${input.name}`);
      }

      return insertedMenu.id;
    },
  };
}

function isEntrypoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  await runSeedRbacFromProcessEnv();
}
