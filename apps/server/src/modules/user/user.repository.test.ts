import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
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
  const select = vi.fn().mockReturnValue(query);
  return { query, repository: new UserRepository({ select } as never) };
}

describe("UserRepository", () => {
  it("returns a platform profile without organization or membership joins filtering the user", async () => {
    const { repository, query } = harness({ user, session, organization: null, role: null });
    expect(await repository.findCurrentUserContext(platform)).toEqual({
      user,
      session,
      accessScope: "platform",
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
      user: { ...user, isSuperAdmin: false },
      session,
      organization: null,
      role: null,
    });
    expect(await repository.findCurrentUserContext(platform)).toBeNull();
  });
});
