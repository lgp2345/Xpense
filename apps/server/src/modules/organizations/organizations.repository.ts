import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizationMemberships, organizations } from "../../db/schema.js";

export type UserOrganization = {
  id: string;
  name: string;
  status: "active" | "disabled";
};

export type ActiveMembership = {
  userId: string;
  organizationId: string;
  organization: UserOrganization;
};

@Injectable()
export class OrganizationsRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async listActiveOrganizationsForUser(userId: string): Promise<UserOrganization[]> {
    return this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        status: organizations.status,
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.status, "active"),
          eq(organizations.status, "active"),
        ),
      )
      .orderBy(desc(organizationMemberships.joinedAt));
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
        organization: {
          id: organizations.id,
          name: organizations.name,
          status: organizations.status,
        },
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.status, "active"),
          eq(organizations.status, "active"),
        ),
      )
      .limit(1);

    return membership ?? null;
  }

  async findActiveOrganization(
    organizationId: string,
    executor: AppDbExecutor,
  ): Promise<UserOrganization | null> {
    const [organization] = await executor
      .select({ id: organizations.id, name: organizations.name, status: organizations.status })
      .from(organizations)
      .where(and(eq(organizations.id, organizationId), eq(organizations.status, "active")))
      .limit(1);
    return organization ?? null;
  }
}
