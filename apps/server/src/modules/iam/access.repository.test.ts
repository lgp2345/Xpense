import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import {
  organizationMembershipRoles,
  organizationMemberships,
  permissions,
  rolePermissions,
} from "../../db/schema.js";
import { AccessRepository } from "./access.repository.js";

describe("AccessRepository session target", () => {
  it.each([
    null,
    "org-1",
  ])("matches the persisted organization target %s", async (organizationId) => {
    const limit = vi.fn().mockResolvedValue([{ id: "session-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const repository = new AccessRepository({
      select: () => ({ from: () => ({ where }) }),
    } as never);
    await expect(
      repository.findActiveSession({ userId: "user-1", sessionId: "session-1", organizationId }),
    ).resolves.toEqual({ id: "session-1" });
    const query = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0]);
    expect(query.sql).toContain('"refresh_sessions"."user_id" =');
    expect(query.sql).toContain('"refresh_sessions"."expires_at" >');
    expect(query.params).toContain("active");
    if (organizationId === null) {
      expect(query.sql).toContain('"refresh_sessions"."current_organization_id" is null');
      expect(query.params).not.toContain(null);
    } else {
      expect(query.sql).toContain('"refresh_sessions"."current_organization_id" =');
      expect(query.params).toContain(organizationId);
    }
  });
});

describe("AccessRepository membership permissions", () => {
  it("loads the distinct permission union of the primary and additional roles", async () => {
    const where = vi.fn().mockResolvedValue([{ key: "members:read" }, { key: "roles:update" }]);
    const query = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where,
    };
    const selectDistinct = vi.fn().mockReturnValue(query);
    const repository = new AccessRepository({ selectDistinct } as never);

    await expect(repository.listPermissionKeysForMembership("member-1")).resolves.toEqual([
      "members:read",
      "roles:update",
    ]);

    expect(selectDistinct).toHaveBeenCalledWith({ key: permissions.key });
    expect(query.from).toHaveBeenCalledWith(organizationMemberships);
    expect(query.leftJoin).toHaveBeenCalledWith(organizationMembershipRoles, expect.anything());
    expect(query.innerJoin).toHaveBeenNthCalledWith(1, rolePermissions, expect.anything());
    expect(query.innerJoin).toHaveBeenNthCalledWith(2, permissions, expect.anything());
    const rolePermissionJoin = query.innerJoin.mock.calls[0]?.[1];
    expect(containsReference(rolePermissionJoin, organizationMemberships.roleId)).toBe(true);
    expect(containsReference(rolePermissionJoin, organizationMembershipRoles.roleId)).toBe(true);
    expect(containsReference(rolePermissionJoin, rolePermissions.roleId)).toBe(true);
    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, organizationMemberships.id)).toBe(true);
    expect(containsReference(condition, "member-1")).toBe(true);
  });
});

function containsReference(
  value: unknown,
  reference: unknown,
  visited = new WeakSet<object>(),
): boolean {
  if (value === reference) return true;
  if (Array.isArray(value)) {
    if (visited.has(value)) return false;
    visited.add(value);
    return value.some((item) => containsReference(item, reference, visited));
  }
  if (typeof value !== "object" || value === null || visited.has(value)) return false;
  visited.add(value);
  return Object.values(value).some((item) => containsReference(item, reference, visited));
}
