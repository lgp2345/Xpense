import { Dependencies, Injectable } from "@nestjs/common";
import type { ClientType, PermissionKey } from "@xpense/shared";
import { and, eq, gt } from "drizzle-orm";

import type { AuthContext } from "../../common/auth/auth-context.js";
import type { AppDb } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import {
  organizationMemberships,
  organizations,
  permissions,
  refreshSessions,
  rolePermissions,
  roles,
  users,
} from "../../db/schema.js";

export type CurrentUserContextRecord = {
  user: {
    id: string;
    email: string;
    isSuperAdmin: boolean;
    status: "active" | "disabled";
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
  session: {
    id: string;
    clientType: ClientType;
  };
};

@Injectable()
@Dependencies(DB)
export class UserRepository {
  constructor(private readonly db: AppDb) {}

  async findCurrentUserContext(authContext: AuthContext): Promise<CurrentUserContextRecord | null> {
    const [record] = await this.db
      .select({
        user: {
          id: users.id,
          email: users.email,
          isSuperAdmin: users.isSuperAdmin,
          status: users.status,
        },
        organization: {
          id: organizations.id,
          name: organizations.name,
        },
        role: {
          id: roles.id,
          key: roles.key,
          name: roles.name,
        },
        session: {
          id: refreshSessions.id,
          clientType: refreshSessions.clientType,
        },
      })
      .from(users)
      .innerJoin(
        refreshSessions,
        and(
          eq(refreshSessions.id, authContext.sessionId),
          eq(refreshSessions.userId, users.id),
          eq(refreshSessions.currentOrganizationId, authContext.organizationId),
          eq(refreshSessions.status, "active"),
          gt(refreshSessions.expiresAt, new Date()),
        ),
      )
      .innerJoin(
        organizations,
        and(eq(organizations.id, authContext.organizationId), eq(organizations.status, "active")),
      )
      .innerJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.userId, users.id),
          eq(organizationMemberships.organizationId, organizations.id),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .innerJoin(roles, eq(organizationMemberships.roleId, roles.id))
      .where(and(eq(users.id, authContext.userId), eq(users.status, "active")))
      .limit(1);

    return record ?? null;
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
