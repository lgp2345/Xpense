import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import {
  organizationMembershipRoles,
  organizationMemberships,
  permissions,
  rolePermissions,
} from "../../db/schema.js";
import { UserRepository } from "./user.repository.js";

const user = {
  id: "user-1",
  email: null,
  phone: "13800000001",
  isSuperAdmin: true,
  initialPasswordUnchanged: true,
  status: "active",
};
const session = { id: "session-1", clientType: "web_pc" };
const platform: SessionAuthContext = {
  userId: user.id,
  sessionId: session.id,
  organizationId: null,
  accessScope: "platform",
  isSuperAdmin: true,
  permissions: [],
};
function harness(record: unknown) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(record ? [record] : []),
  };
  for (const key of ["from", "innerJoin", "leftJoin", "where"] as const)
    query[key].mockReturnValue(query);
  const permissionQuery = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ key: "roles:read" }, { key: "members:read" }]),
  };
  const select = vi.fn().mockReturnValue(query);
  const selectDistinct = vi.fn().mockReturnValue(permissionQuery);
  return {
    query,
    permissionQuery,
    selectDistinct,
    repository: new UserRepository({ select, selectDistinct } as never),
  };
}

describe("UserRepository", () => {
  it("returns a platform profile without organization or membership joins filtering the user", async () => {
    const { repository, query } = harness({
      membershipId: null,
      user,
      session,
      organization: null,
      role: null,
    });
    expect(await repository.findCurrentUserContext(platform)).toEqual({
      user,
      session,
      accessScope: "platform",
      membershipId: null,
      organization: null,
      role: null,
    });
    expect(query.innerJoin).toHaveBeenCalledTimes(1);
    expect(query.leftJoin).toHaveBeenCalledTimes(3);
    const condition = query.innerJoin.mock.calls[0]?.[1];
    expect(new PgDialect().sqlToQuery(condition).sql).toContain(
      '"refresh_sessions"."current_organization_id" is null',
    );
  });

  it.each([
    true,
    false,
  ])("only allows missing membership for a super-admin (%s)", async (isSuperAdmin) => {
    const record = {
      user: { ...user, isSuperAdmin },
      session,
      organization: {
        id: "org-1",
        name: "Org",
        status: "active",
        baseCurrency: "USD",
        timezone: "UTC",
      },
      role: null,
      membershipId: null,
    };
    const { repository } = harness(record);
    const result = await repository.findCurrentUserContext({
      ...platform,
      accessScope: "organization",
      organizationId: "org-1",
      isSuperAdmin,
    });
    expect(result).toEqual(isSuperAdmin ? { ...record, accessScope: "organization" } : null);
  });

  it("rejects a disabled or missing organization after the guard check", async () => {
    const { repository } = harness({ user, session, organization: null, role: null });
    expect(
      await repository.findCurrentUserContext({
        ...platform,
        accessScope: "organization",
        organizationId: "org-1",
      }),
    ).toBeNull();
  });

  it("rejects a platform profile when the live super-admin flag was revoked", async () => {
    const { repository } = harness({
      membershipId: null,
      user: { ...user, isSuperAdmin: false },
      session,
      organization: null,
      role: null,
    });
    expect(await repository.findCurrentUserContext(platform)).toBeNull();
  });

  it("loads permissions through both primary and attached roles for a membership", async () => {
    const { repository, permissionQuery, selectDistinct } = harness(null);

    await expect(repository.listPermissionKeysForMembership("member-1")).resolves.toEqual([
      "roles:read",
      "members:read",
    ]);

    expect(selectDistinct).toHaveBeenCalledWith({ key: permissions.key });
    expect(permissionQuery.from).toHaveBeenCalledWith(organizationMemberships);
    expect(permissionQuery.leftJoin).toHaveBeenCalledWith(
      organizationMembershipRoles,
      expect.anything(),
    );
    expect(permissionQuery.innerJoin).toHaveBeenNthCalledWith(
      1,
      rolePermissions,
      expect.anything(),
    );
    expect(permissionQuery.innerJoin).toHaveBeenNthCalledWith(2, permissions, expect.anything());
    const rolePermissionJoin = permissionQuery.innerJoin.mock.calls[0]?.[1];
    expect(rolePermissionJoin).toBeDefined();
    expect(new PgDialect().sqlToQuery(rolePermissionJoin).sql).toContain(
      '"organization_membership_roles"',
    );
    const condition = permissionQuery.where.mock.calls[0]?.[0];
    expect(new PgDialect().sqlToQuery(condition).params).toContain("member-1");
  });
});
