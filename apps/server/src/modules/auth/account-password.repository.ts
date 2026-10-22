import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizationMemberships, organizations, users } from "../../db/schema.js";

@Injectable()
export class AccountPasswordRepository {
  constructor(@Inject(DB) private readonly db: AppDbExecutor) {}

  async updatePassword(
    userId: string,
    passwordHash: string,
    executor: AppDbExecutor = this.db,
  ): Promise<void> {
    await executor
      .update(users)
      .set({ passwordHash, initialPasswordUnchanged: false, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async canUseOrganization(
    userId: string,
    organizationId: string,
    isSuperAdmin: boolean,
    executor: AppDbExecutor,
  ): Promise<boolean> {
    const [organization] = await executor
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.id, organizationId), eq(organizations.status, "active")))
      .limit(1);
    if (!organization) return false;
    if (isSuperAdmin) return true;
    const [member] = await executor
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .limit(1);
    return Boolean(member);
  }
}
