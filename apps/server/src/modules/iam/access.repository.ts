import { Inject, Injectable } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";
import { and, eq, gt, isNull } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import {
  organizationMemberships,
  organizations,
  permissions,
  refreshSessions,
  rolePermissions,
  users,
} from "../../db/schema.js";
import type { AccessTokenPayload } from "../auth/token.service.js";

export type ActiveSession = {
  id: string;
  userId: string;
  currentOrganizationId: string | null;
};

export type ActiveUser = {
  id: string;
  isSuperAdmin: boolean;
};

export type ActiveOrganization = {
  id: string;
};

export type ActiveMembership = {
  userId: string;
  organizationId: string;
  roleId: string;
};

@Injectable()
export class AccessRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async findActiveSession(
    payload: AccessTokenPayload,
    executor: AppDbExecutor = this.db,
  ): Promise<ActiveSession | null> {
    const [session] = await executor
      .select({
        id: refreshSessions.id,
        userId: refreshSessions.userId,
        currentOrganizationId: refreshSessions.currentOrganizationId,
      })
      .from(refreshSessions)
      .where(
        and(
          eq(refreshSessions.id, payload.sessionId),
          eq(refreshSessions.userId, payload.userId),
          payload.organizationId === null
            ? isNull(refreshSessions.currentOrganizationId)
            : eq(refreshSessions.currentOrganizationId, payload.organizationId),
          eq(refreshSessions.status, "active"),
          gt(refreshSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return session ?? null;
  }

  async findActiveUser(
    userId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<ActiveUser | null> {
    const [user] = await executor
      .select({
        id: users.id,
        isSuperAdmin: users.isSuperAdmin,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, "active")))
      .limit(1);

    return user ?? null;
  }

  async findActiveOrganization(
    organizationId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<ActiveOrganization | null> {
    const [organization] = await executor
      .select({
        id: organizations.id,
      })
      .from(organizations)
      .where(and(eq(organizations.id, organizationId), eq(organizations.status, "active")))
      .limit(1);

    return organization ?? null;
  }

  async findActiveMembership(
    userId: string,
    organizationId: string,
    executor: AppDbExecutor = this.db,
  ): Promise<ActiveMembership | null> {
    const [membership] = await executor
      .select({
        userId: organizationMemberships.userId,
        organizationId: organizationMemberships.organizationId,
        roleId: organizationMemberships.roleId,
      })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .limit(1);

    return membership ?? null;
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
}
