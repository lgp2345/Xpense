import { Dependencies, Injectable } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";
import { and, eq, gt } from "drizzle-orm";

import type { AppDb } from "../../db/db.module.js";
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
@Dependencies(DB)
export class AccessRepository {
  constructor(private readonly db: AppDb) {}

  async findActiveSession(payload: AccessTokenPayload): Promise<ActiveSession | null> {
    const [session] = await this.db
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
          eq(refreshSessions.currentOrganizationId, payload.organizationId),
          eq(refreshSessions.status, "active"),
          gt(refreshSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return session ?? null;
  }

  async findActiveUser(userId: string): Promise<ActiveUser | null> {
    const [user] = await this.db
      .select({
        id: users.id,
        isSuperAdmin: users.isSuperAdmin,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, "active")))
      .limit(1);

    return user ?? null;
  }

  async findActiveOrganization(organizationId: string): Promise<ActiveOrganization | null> {
    const [organization] = await this.db
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
  ): Promise<ActiveMembership | null> {
    const [membership] = await this.db
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

  async listPermissionKeysForRole(roleId: string): Promise<PermissionKey[]> {
    const rows = await this.db
      .select({
        key: permissions.key,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));

    return rows.map((row) => row.key as PermissionKey);
  }
}
