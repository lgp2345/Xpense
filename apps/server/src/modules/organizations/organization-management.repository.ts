import { Inject, Injectable } from "@nestjs/common";
import type {
  OrganizationDetail,
  OrganizationListQuery,
  OrganizationOwner,
  OrganizationOwnerCandidate,
  OrganizationProfile,
} from "@xpense/shared";
import { and, asc, count, eq, ilike, inArray, isNull, type SQL } from "drizzle-orm";
import type { AppDb, AppDbExecutor } from "../../db/db.module.js";
import { DB } from "../../db/db.tokens.js";
import { organizationMemberships, organizations, roles, users } from "../../db/schema.js";
import type { CreateOrganizationDto } from "./dto/create-organization.dto.js";
import type { UpdateOrganizationProfileDto } from "./dto/update-organization-profile.dto.js";

const profileFields = {
  id: organizations.id,
  name: organizations.name,
  status: organizations.status,
  baseCurrency: organizations.baseCurrency,
  timezone: organizations.timezone,
  contactName: organizations.contactName,
  contactPhone: organizations.contactPhone,
  address: organizations.address,
};
@Injectable()
export class OrganizationManagementRepository {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async findActor(userId: string, tx: AppDbExecutor = this.db, lock = false) {
    const query = tx
      .select({ id: users.id, isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, "active")));
    const [user] = lock ? await query.for("no key update").limit(1) : await query.limit(1);
    return user ?? null;
  }
  async findOwnerCandidate(
    phone: string,
    tx: AppDbExecutor = this.db,
  ): Promise<OrganizationOwnerCandidate | null> {
    const [user] = await tx
      .select({ userId: users.id, phone: users.phone, email: users.email, status: users.status })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    return user ?? null;
  }
  async findBuiltinOwnerRole(tx: AppDbExecutor): Promise<string | null> {
    const [role] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(isNull(roles.organizationId), eq(roles.key, "owner"), eq(roles.isSystem, true)))
      .limit(1);
    return role?.id ?? null;
  }
  async insertUser(
    input: { phone: string; email: string | null; passwordHash: string },
    tx: AppDbExecutor,
  ): Promise<string> {
    const [user] = await tx
      .insert(users)
      .values({ ...input, initialPasswordUnchanged: true })
      .returning({ id: users.id });
    if (!user) throw new Error("负责人账号创建失败");
    return user.id;
  }
  async insertOrganization(
    input: Omit<CreateOrganizationDto, "owners">,
    actorUserId: string,
    tx: AppDbExecutor,
  ): Promise<OrganizationProfile> {
    const [org] = await tx
      .insert(organizations)
      .values({ ...input, createdByUserId: actorUserId })
      .returning(profileFields);
    if (!org) throw new Error("组织创建失败");
    return org;
  }
  async addOwners(
    organizationId: string,
    userIds: string[],
    roleId: string,
    tx: AppDbExecutor,
  ): Promise<void> {
    await tx
      .insert(organizationMemberships)
      .values(
        userIds.map((userId) => ({ organizationId, userId, roleId, status: "active" as const })),
      );
  }
  async ownersForOrganizations(
    ids: string[],
    tx: AppDbExecutor = this.db,
  ): Promise<Map<string, OrganizationOwner[]>> {
    const result = new Map<string, OrganizationOwner[]>();
    if (!ids.length) return result;
    const rows = await tx
      .select({
        organizationId: organizationMemberships.organizationId,
        userId: users.id,
        phone: users.phone,
        email: users.email,
      })
      .from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .innerJoin(roles, eq(roles.id, organizationMemberships.roleId))
      .where(
        and(
          inArray(organizationMemberships.organizationId, ids),
          eq(organizationMemberships.status, "active"),
          eq(users.status, "active"),
          eq(roles.key, "owner"),
          eq(roles.isSystem, true),
        ),
      )
      .orderBy(asc(users.id));
    for (const { organizationId, ...owner } of rows) {
      const owners = result.get(organizationId) ?? [];
      owners.push(owner);
      result.set(organizationId, owners);
    }
    return result;
  }
  async list(input: OrganizationListQuery) {
    const conditions: SQL[] = [];
    if (input.name)
      conditions.push(ilike(organizations.name, `%${input.name.replace(/[\\%_]/g, "\\$&")}%`));
    if (input.status) conditions.push(eq(organizations.status, input.status));
    const where = and(...conditions);
    const items = await this.db
      .select(profileFields)
      .from(organizations)
      .where(where)
      .orderBy(asc(organizations.name), asc(organizations.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    const [total] = await this.db.select({ count: count() }).from(organizations).where(where);
    const owners = await this.ownersForOrganizations(items.map((item) => item.id));
    return {
      items: items.map((item) => ({ ...item, owners: owners.get(item.id) ?? [] })),
      total: total?.count ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
  async profile(id: string, tx: AppDbExecutor = this.db): Promise<OrganizationProfile | null> {
    const [org] = await tx
      .select(profileFields)
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    return org ?? null;
  }
  async detail(id: string, tx: AppDbExecutor = this.db): Promise<OrganizationDetail | null> {
    const org = await this.profile(id, tx);
    return org
      ? { ...org, owners: (await this.ownersForOrganizations([id], tx)).get(id) ?? [] }
      : null;
  }
  async updateProfile(
    id: string,
    input: UpdateOrganizationProfileDto,
    tx: AppDbExecutor,
  ): Promise<OrganizationProfile> {
    const [org] = await tx
      .update(organizations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning(profileFields);
    if (!org) throw new Error("组织资料不可用");
    return org;
  }
}
