import { Dependencies, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import type { AppDb } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizationMemberships, organizations, refreshSessions } from "../../db/schema.js";

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
@Dependencies(DB)
export class OrganizationsRepository {
  constructor(private readonly db: AppDb) {}

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
  ): Promise<ActiveMembership | null> {
    const [membership] = await this.db
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

  async updateSessionOrganization(sessionId: string, organizationId: string): Promise<void> {
    await this.db
      .update(refreshSessions)
      .set({
        currentOrganizationId: organizationId,
        updatedAt: new Date(),
      })
      .where(and(eq(refreshSessions.id, sessionId), eq(refreshSessions.status, "active")));
  }
}
