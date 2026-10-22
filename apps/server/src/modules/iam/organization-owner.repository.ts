import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, isNull, or } from "drizzle-orm";
import type { AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizationMemberships, organizations, roles, users } from "../../db/schema.js";

@Injectable()
export class OrganizationOwnerRepository {
  constructor(@Inject(DB) private readonly db: AppDbExecutor) {}

  /** 同组织写入串行，且不阻塞会话插入时的外键 KEY SHARE 检查。 */
  async lockOrganization(organizationId: string, tx: AppDbExecutor): Promise<boolean> {
    const [row] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.id, organizationId), eq(organizations.status, "active")))
      .for("no key update")
      .limit(1);
    return Boolean(row);
  }

  async findActiveUser(userId: string, tx: AppDbExecutor = this.db) {
    const [user] = await tx
      .select({ id: users.id, isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, "active")))
      .limit(1);
    return user ?? null;
  }

  async findActiveMemberRole(
    organizationId: string,
    userId: string,
    tx: AppDbExecutor,
  ): Promise<string | null> {
    const [member] = await tx
      .select({ key: roles.key, isSystem: roles.isSystem })
      .from(organizationMemberships)
      .innerJoin(roles, eq(roles.id, organizationMemberships.roleId))
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .limit(1);
    return member && (member.key !== "owner" || member.isSystem) ? member.key : null;
  }

  async findRoleKey(
    organizationId: string,
    roleId: string,
    tx: AppDbExecutor,
  ): Promise<string | null> {
    const [role] = await tx
      .select({ key: roles.key, isSystem: roles.isSystem })
      .from(roles)
      .where(
        and(
          eq(roles.id, roleId),
          or(eq(roles.organizationId, organizationId), isNull(roles.organizationId)),
        ),
      )
      .limit(1);
    return role && (role.key !== "owner" || role.isSystem) ? role.key : null;
  }

  async countActiveOwners(organizationId: string, tx: AppDbExecutor): Promise<number> {
    const [row] = await tx
      .select({ count: count() })
      .from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .innerJoin(roles, eq(roles.id, organizationMemberships.roleId))
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.status, "active"),
          eq(users.status, "active"),
          eq(roles.key, "owner"),
          eq(roles.isSystem, true),
        ),
      );
    return row?.count ?? 0;
  }
}
