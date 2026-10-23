import { describe, expect, it, vi } from "vitest";

import { permissions, rolePermissions, roles } from "../../db/schema.js";
import { IamRepository } from "./iam.repository.js";

function containsReference(
  value: unknown,
  reference: unknown,
  visited = new WeakSet<object>(),
): boolean {
  if (value === reference) {
    return true;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return false;
    }
    visited.add(value);
    return value.some((item) => containsReference(item, reference, visited));
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (visited.has(value)) {
    return false;
  }
  visited.add(value);
  return Object.values(value).some((item) => containsReference(item, reference, visited));
}

describe("IamRepository permission locks", () => {
  it("uses the supplied executor to lock one role by organization and role id", async () => {
    const role = {
      id: "role-1",
      organizationId: "organization-1",
      key: "staff",
      name: "Staff",
      description: "",
      isSystem: false,
      isEditable: true,
    };
    const limit = vi.fn().mockResolvedValue([role]);
    const forUpdate = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ for: forUpdate });
    const from = vi.fn().mockReturnValue({ where });
    const executorSelect = vi.fn().mockReturnValue({ from });
    const dbSelect = vi.fn();
    const repository = new IamRepository({ select: dbSelect } as never);

    await expect(
      repository.lockRoleById("organization-1", "role-1", { select: executorSelect } as never),
    ).resolves.toEqual(role);

    expect(executorSelect).toHaveBeenCalledOnce();
    expect(dbSelect).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith(roles);
    expect(forUpdate).toHaveBeenCalledWith("update");
    expect(limit).toHaveBeenCalledWith(1);
    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, roles.organizationId)).toBe(true);
    expect(containsReference(condition, "organization-1")).toBe(true);
    expect(containsReference(condition, roles.id)).toBe(true);
    expect(containsReference(condition, "role-1")).toBe(true);
  });

  it("uses the supplied executor to lock role-permission association rows", async () => {
    const rows = [{ key: "members:read" }];
    const forUpdate = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ for: forUpdate });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const executorSelect = vi.fn().mockReturnValue({ from });
    const dbSelect = vi.fn();
    const repository = new IamRepository({ select: dbSelect } as never);

    await expect(
      repository.lockPermissionKeysForRole("role-1", { select: executorSelect } as never),
    ).resolves.toEqual(["members:read"]);

    expect(executorSelect).toHaveBeenCalledWith({ key: permissions.key });
    expect(dbSelect).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith(rolePermissions);
    expect(innerJoin).toHaveBeenCalledWith(permissions, expect.anything());
    const joinCondition = innerJoin.mock.calls[0]?.[1];
    expect(containsReference(joinCondition, rolePermissions.permissionId)).toBe(true);
    expect(containsReference(joinCondition, permissions.id)).toBe(true);
    const condition = where.mock.calls[0]?.[0];
    expect(containsReference(condition, rolePermissions.roleId)).toBe(true);
    expect(containsReference(condition, "role-1")).toBe(true);
    expect(forUpdate).toHaveBeenCalledWith("update", { of: rolePermissions });
  });
});

describe("成员负责人数量查询", () => {
  it("returns a count filtered by account and membership activity in the same organization query", async () => {
    let selected: Record<string, unknown> = {};
    const where = vi.fn().mockResolvedValue([{ effectiveOwnerCount: 1, userStatus: "active" }]);
    const joined = { innerJoin: vi.fn().mockReturnThis(), where };
    const db = {
      select: vi.fn().mockImplementation((fields) => {
        selected = fields;
        return { from: () => joined };
      }),
    };
    const rows = await new IamRepository(db as never).listMembers("org-1");
    expect(rows[0]?.effectiveOwnerCount).toBe(1);
    const { users, organizationMemberships } = await import("../../db/schema.js");
    expect(containsReference(selected.effectiveOwnerCount, users.status)).toBe(true);
    expect(containsReference(selected.effectiveOwnerCount, organizationMemberships.status)).toBe(
      true,
    );
    expect(containsReference(selected.effectiveOwnerCount, roles.isSystem)).toBe(true);
    expect(containsReference(where.mock.calls[0]?.[0], "org-1")).toBe(true);
  });
});
