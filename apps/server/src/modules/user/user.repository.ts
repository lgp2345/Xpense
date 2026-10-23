import { Inject, Injectable } from "@nestjs/common";
import type { CurrentUserResponse, PermissionKey } from "@xpense/shared";
import { and, eq, gt, isNull, or } from "drizzle-orm";

import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import type { AppDb } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import {
  organizationMembershipRoles,
  organizationMemberships,
  organizations,
  permissions,
  refreshSessions,
  rolePermissions,
  roles,
  users,
} from "../../db/schema.js";

export type CurrentUserContextRecord = Omit<
  CurrentUserResponse,
  "permissions" | "accessScope" | "organization" | "role"
> & { membershipId: string | null } & (
    | { accessScope: "platform"; organization: null; role: null }
    | {
        accessScope: "organization";
        organization: NonNullable<CurrentUserResponse["organization"]>;
        role: CurrentUserResponse["role"];
      }
  );

@Injectable()
export class UserRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async findCurrentUserContext(
    authContext: SessionAuthContext,
  ): Promise<CurrentUserContextRecord | null> {
    const [record] = await this.db
      .select({
        user: {
          id: users.id,
          email: users.email,
          phone: users.phone,
          isSuperAdmin: users.isSuperAdmin,
          initialPasswordUnchanged: users.initialPasswordUnchanged,
          status: users.status,
        },
        organization: {
          id: organizations.id,
          name: organizations.name,
          status: organizations.status,
          baseCurrency: organizations.baseCurrency,
          timezone: organizations.timezone,
        },
        role: {
          id: roles.id,
          key: roles.key,
          name: roles.name,
        },
        membershipId: organizationMemberships.id,
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
          authContext.organizationId === null
            ? isNull(refreshSessions.currentOrganizationId)
            : eq(refreshSessions.currentOrganizationId, authContext.organizationId),
          eq(refreshSessions.status, "active"),
          gt(refreshSessions.expiresAt, new Date()),
        ),
      )
      .leftJoin(
        organizations,
        and(
          eq(organizations.id, refreshSessions.currentOrganizationId),
          eq(organizations.status, "active"),
        ),
      )
      .leftJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.userId, users.id),
          eq(organizationMemberships.organizationId, organizations.id),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .leftJoin(roles, eq(organizationMemberships.roleId, roles.id))
      .where(and(eq(users.id, authContext.userId), eq(users.status, "active")))
      .limit(1);

    if (!record) return null;
    if (authContext.accessScope === "platform") {
      return record.user.isSuperAdmin
        ? {
            user: record.user,
            session: record.session,
            accessScope: "platform",
            membershipId: record.membershipId,
            organization: null,
            role: null,
          }
        : null;
    }
    if (!record.organization || (!record.user.isSuperAdmin && !record.role)) return null;
    return { ...record, accessScope: "organization", organization: record.organization };
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

  async listPermissionKeysForMembership(membershipId: string): Promise<PermissionKey[]> {
    const rows = await this.db
      .selectDistinct({ key: permissions.key })
      .from(organizationMemberships)
      .leftJoin(
        organizationMembershipRoles,
        eq(organizationMembershipRoles.membershipId, organizationMemberships.id),
      )
      .innerJoin(
        rolePermissions,
        or(
          eq(rolePermissions.roleId, organizationMemberships.roleId),
          eq(rolePermissions.roleId, organizationMembershipRoles.roleId),
        ),
      )
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(organizationMemberships.id, membershipId));

    return rows.map((row) => row.key as PermissionKey);
  }
}
