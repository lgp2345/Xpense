import { Dependencies, Injectable } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";
import { and, count, eq, inArray, isNull, or } from "drizzle-orm";

import type { AppDb } from "../../db/db.module.js";
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
  ReplaceRolePermissionsInput,
  UpdateMemberInput,
  UpdateRoleInput,
} from "./iam.types.js";

@Injectable()
@Dependencies(DB)
export class IamRepository {
  constructor(private readonly db: AppDb) {}

  async listMembers(organizationId: string): Promise<IamMember[]> {
    return this.db
      .select(memberSelectFields)
      .from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id))
      .innerJoin(roles, eq(organizationMemberships.roleId, roles.id))
      .where(eq(organizationMemberships.organizationId, organizationId));
  }

  async findMemberById(organizationId: string, memberId: string): Promise<IamMember | null> {
    const [member] = await this.db
      .select(memberSelectFields)
      .from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id))
      .innerJoin(roles, eq(organizationMemberships.roleId, roles.id))
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.id, memberId),
        ),
      )
      .limit(1);

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

  async createMember(input: CreateMemberInput): Promise<IamMember> {
    const [member] = await this.db
      .insert(organizationMemberships)
      .values(input)
      .returning({ id: organizationMemberships.id });

    if (!member) {
      throw new Error("Failed to create organization member");
    }

    const createdMember = await this.findMemberById(input.organizationId, member.id);

    if (!createdMember) {
      throw new Error("Created organization member is unavailable");
    }

    return createdMember;
  }

  async updateMember(input: UpdateMemberInput): Promise<IamMember> {
    await this.db
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

    const updatedMember = await this.findMemberById(input.organizationId, input.memberId);

    if (!updatedMember) {
      throw new Error("Updated organization member is unavailable");
    }

    return updatedMember;
  }

  async revokeActiveSessionsForUserInOrganization(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const now = new Date();

    await this.db
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

  async listRoles(organizationId: string): Promise<IamRole[]> {
    return this.db
      .select(roleSelectFields)
      .from(roles)
      .where(or(eq(roles.organizationId, organizationId), isNull(roles.organizationId)));
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

  async createRole(input: CreateRoleInput): Promise<IamRole> {
    const [role] = await this.db
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

  async updateRole(input: UpdateRoleInput): Promise<IamRole> {
    const [role] = await this.db
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

  async deleteRole(organizationId: string, roleId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      await tx
        .delete(roles)
        .where(and(eq(roles.organizationId, organizationId), eq(roles.id, roleId)));
    });
  }

  async replaceRolePermissions(input: ReplaceRolePermissionsInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));

      if (input.permissionKeys.length === 0) {
        return;
      }

      const permissionRows = await tx
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

      await tx.insert(rolePermissions).values(values).onConflictDoNothing();
    });
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
