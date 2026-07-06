import { pathToFileURL } from "node:url";
import { type PermissionKey, permissionKeys, type SystemRoleKey } from "@xpense/shared";
import argon2 from "argon2";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseServerEnv, type ServerEnv } from "../config/env.schema.js";
import * as schema from "./schema.js";
import {
  organizationMemberships,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users,
} from "./schema.js";

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;
type SeedTransaction = Parameters<Parameters<SeedDb["transaction"]>[0]>[0];
type SeedExecutor = SeedDb | SeedTransaction;

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

export function buildRbacSeedPlan(): RbacSeedPlan {
  const permissions = permissionKeys.map((key) => {
    const [resource, ...actionParts] = key.split(".");

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

export async function seedRbac(db: SeedDb, env: ServerEnv): Promise<void> {
  const plan = buildRbacSeedPlan();

  await db.transaction(async (tx) => {
    const permissionIdByKey = await upsertPermissions(tx, plan.permissions);
    const roleIdByKey = await upsertSystemRoles(tx, plan.roles);

    for (const role of plan.roles) {
      const roleId = roleIdByKey.get(role.key);

      if (!roleId) {
        throw new Error(`Missing seeded role: ${role.key}`);
      }

      await replaceRolePermissions(tx, roleId, role.permissions, permissionIdByKey);
    }

    await seedBootstrapData(tx, env, roleIdByKey);
  });
}

export async function runSeedRbacFromProcessEnv(
  envInput: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const env = parseServerEnv(envInput);
  const client = postgres(env.DATABASE_URL);
  const db = drizzle(client, { schema });

  try {
    await seedRbac(db, env);
  } finally {
    await client.end();
  }
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
): Promise<void> {
  if (
    !env.BOOTSTRAP_SUPER_ADMIN_EMAIL ||
    !env.BOOTSTRAP_SUPER_ADMIN_PASSWORD ||
    !env.BOOTSTRAP_ORGANIZATION_NAME
  ) {
    return;
  }

  const superAdminUserId = await upsertBootstrapUser(
    db,
    env.BOOTSTRAP_SUPER_ADMIN_EMAIL,
    env.BOOTSTRAP_SUPER_ADMIN_PASSWORD,
  );
  const organizationId = await ensureBootstrapOrganization(
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
      organizationId,
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
}

async function upsertBootstrapUser(
  db: SeedExecutor,
  email: string,
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
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));

    return existingUser.id;
  }

  const [insertedUser] = await db
    .insert(users)
    .values({
      email,
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
): Promise<string> {
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

    return existingOrganization.id;
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

  return insertedOrganization.id;
}

function isEntrypoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  await runSeedRbacFromProcessEnv();
}
