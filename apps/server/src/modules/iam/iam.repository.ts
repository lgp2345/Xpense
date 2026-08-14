import { Inject, Injectable } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";
import { and, count, eq, inArray, isNull, or } from "drizzle-orm";

import type { AppDb, AppDbExecutor, AppDbTransaction } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import {
  organizationMemberships,
  permissions,
  refreshSessions,
  rolePermissions,
  roles,
  users,
} from "../../db/schema.js";
import {
  memberSelectFields,
  permissionSelectFields,
  roleSelectFields,
} from "./iam.repository.select-fields.js";
import type {
  CreateMemberInput,
  CreateRoleInput,
  IamMember,
  IamPermission,
  IamRole,
  IamRoleWithPermissions,
  ReplaceRolePermissionsInput,
  UpdateMemberInput,
  UpdateRoleInput,
} from "./iam.types.js";

@Injectable()
export class IamRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async listMembers(organizationId: string): Promise<IamMember[]> {
    return this.db
      .select(memberSelectFields)
      .from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id))
      .innerJoin(roles, eq(organizationMemberships.roleId, roles.id))
      .where(eq(organizationMemberships.organizationId, organizationId));
  }

  async findMemberById(
    organizationId: string,
    memberId: string,
    executor: AppDbExecutor = this.db,
    lockForUpdate = false,
  ): Promise<IamMember | null> {
    const query = executor
      .select(memberSelectFields)
      .from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id))
      .innerJoin(roles, eq(organizationMemberships.roleId, roles.id))
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.id, memberId),
        ),
      );
    const [member] = lockForUpdate ? await query.for("update").limit(1) : await query.limit(1);

    return member ?? null;
  }

  async findMemberByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<IamMember | null> {
    const [member] = await this.db
      .select(memberSelectFields)
      .from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id))
      .innerJoin(roles, eq(organizationMemberships.roleId, roles.id))
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, userId),
        ),
      )
      .limit(1);

    return member ?? null;
  }

  async createMember(
    input: CreateMemberInput,
    executor: AppDbExecutor = this.db,
  ): Promise<IamMember> {
    const [member] = await executor
      .insert(organizationMemberships)
      .values(input)
      .returning({ id: organizationMemberships.id });

    if (!member) {
      throw new Error("Failed to create organization member");
    }

    const createdMember = await this.findMemberById(input.organizationId, member.id, executor);

    if (!createdMember) {
      throw new Error("Created organization member is unavailable");
    }

    return createdMember;
  }

  async updateMember(
    input: UpdateMemberInput,
    executor: AppDbExecutor = this.db,
  ): Promise<IamMember> {
    await executor
      .update(organizationMemberships)
      .set({
        roleId: input.roleId,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationMemberships.organizationId, input.organizationId),
          eq(organizationMemberships.id, input.memberId),
        ),
      );

    const updatedMember = await this.findMemberById(input.organizationId, input.memberId, executor);

    if (!updatedMember) {
      throw new Error("Updated organization member is unavailable");
    }

    return updatedMember;
  }

  async revokeActiveSessionsForUserInOrganization(
    userId: string,
    organizationId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<void> {
    const now = new Date();

    await executor
      .update(refreshSessions)
      .set({
        status: "revoked",
        revokedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(refreshSessions.userId, userId),
          eq(refreshSessions.currentOrganizationId, organizationId),
          eq(refreshSessions.status, "active"),
        ),
      );
  }

  async listRoles(organizationId: string): Promise<IamRoleWithPermissions[]> {
    const roleRows = await this.db
      .select(roleSelectFields)
      .from(roles)
      .where(or(eq(roles.organizationId, organizationId), isNull(roles.organizationId)));

    if (roleRows.length === 0) {
      return [];
    }

    const permissionRows = await this.db
      .select({
        roleId: rolePermissions.roleId,
        key: permissions.key,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(
        inArray(
          rolePermissions.roleId,
          roleRows.map((role) => role.id),
        ),
      );

    const permissionKeysByRoleId = Map.groupBy(permissionRows, (permission) => permission.roleId);

    return roleRows.map((role) => ({
      ...role,
      permissionKeys: (permissionKeysByRoleId.get(role.id) ?? []).map(
        (permission) => permission.key as PermissionKey,
      ),
    }));
  }

  async findRoleById(organizationId: string, roleId: string): Promise<IamRole | null> {
    const [role] = await this.db
      .select(roleSelectFields)
      .from(roles)
      .where(
        and(
          eq(roles.id, roleId),
          or(eq(roles.organizationId, organizationId), isNull(roles.organizationId)),
        ),
      )
      .limit(1);

    return role ?? null;
  }

  async lockRoleById(
    organizationId: string,
    roleId: string,
    executor: AppDbExecutor,
  ): Promise<IamRole | null> {
    const [role] = await executor
      .select(roleSelectFields)
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.organizationId, organizationId)))
      .for("update")
      .limit(1);

    return role ?? null;
  }

  async findRoleByKey(organizationId: string, key: string): Promise<IamRole | null> {
    const [role] = await this.db
      .select(roleSelectFields)
      .from(roles)
      .where(
        and(
          eq(roles.key, key),
          or(eq(roles.organizationId, organizationId), isNull(roles.organizationId)),
        ),
      )
      .limit(1);

    return role ?? null;
  }

  async listPermissionKeysForRole(
    roleId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<PermissionKey[]> {
    const rows = await executor
      .select({
        key: permissions.key,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));

    return rows.map((row) => row.key as PermissionKey);
  }

  async lockPermissionKeysForRole(
    roleId: string,
    executor: AppDbExecutor,
  ): Promise<PermissionKey[]> {
    const rows = await executor
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId))
      .for("update", { of: rolePermissions });

    return rows.map((row) => row.key as PermissionKey);
  }

  async createRole(input: CreateRoleInput, executor: AppDbExecutor = this.db): Promise<IamRole> {
    const [role] = await executor
      .insert(roles)
      .values({
        organizationId: input.organizationId,
        key: input.key,
        name: input.name,
        description: input.description,
        isSystem: false,
        isEditable: true,
      })
      .returning({
        ...roleSelectFields,
      });

    if (!role) {
      throw new Error("Failed to create role");
    }

    return role;
  }

  async updateRole(input: UpdateRoleInput, executor: AppDbExecutor = this.db): Promise<IamRole> {
    const [role] = await executor
      .update(roles)
      .set({
        name: input.name,
        description: input.description,
        updatedAt: new Date(),
      })
      .where(and(eq(roles.organizationId, input.organizationId), eq(roles.id, input.roleId)))
      .returning({
        ...roleSelectFields,
      });

    if (!role) {
      throw new Error("Updated role is unavailable");
    }

    return role;
  }

  async deleteRole(
    organizationId: string,
    roleId: string,
    transaction?: AppDbTransaction,
  ): Promise<void> {
    const deleteWith = async (executor: AppDbExecutor): Promise<void> => {
      await executor.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      await executor
        .delete(roles)
        .where(and(eq(roles.organizationId, organizationId), eq(roles.id, roleId)));
    };

    if (transaction) {
      await deleteWith(transaction);
      return;
    }

    await this.db.transaction(deleteWith);
  }

  async replaceRolePermissions(
    input: ReplaceRolePermissionsInput,
    transaction?: AppDbTransaction,
  ): Promise<void> {
    const replaceWith = async (executor: AppDbExecutor): Promise<void> => {
      await executor.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));

      if (input.permissionKeys.length === 0) {
        return;
      }

      const permissionRows = await executor
        .select({
          id: permissions.id,
          key: permissions.key,
        })
        .from(permissions)
        .where(inArray(permissions.key, input.permissionKeys));

      const permissionIdsByKey = new Map(permissionRows.map((row) => [row.key, row.id]));
      const values = input.permissionKeys.map((permissionKey) => {
        const permissionId = permissionIdsByKey.get(permissionKey);

        if (!permissionId) {
          throw new Error(`Unknown permission key: ${permissionKey}`);
        }

        return {
          roleId: input.roleId,
          permissionId,
        };
      });

      await executor.insert(rolePermissions).values(values).onConflictDoNothing();
    };

    if (transaction) {
      await replaceWith(transaction);
      return;
    }

    await this.db.transaction(replaceWith);
  }

  async countMembersUsingRole(organizationId: string, roleId: string): Promise<number> {
    const [result] = await this.db
      .select({
        value: count(),
      })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.roleId, roleId),
        ),
      );

    return result?.value ?? 0;
  }

  async listPermissions(): Promise<IamPermission[]> {
    const rows = await this.db.select(permissionSelectFields).from(permissions);

    return rows.map((row) => ({
      ...row,
      key: row.key as PermissionKey,
    }));
  }
}
