import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  organizationMembershipRoles,
  organizationMemberships,
  permissions,
  rolePermissions,
  roles,
} from "../../db/schema.js";
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

describe("IAM 成员多角色", () => {
  it("批量读取列表成员的主角色和附加角色", async () => {
    const memberRows = [
      {
        id: "member-1",
        organizationId: "org-1",
        userId: "user-1",
        username: "alice",
        email: null,
        phone: "13800000001",
        roleId: "role-owner",
        roleKey: "owner",
        roleName: "Owner",
        status: "active",
        joinedAt: new Date("2026-01-01T00:00:00Z"),
        userStatus: "active",
        effectiveOwnerCount: 1,
      },
      {
        id: "member-2",
        organizationId: "org-1",
        userId: "user-2",
        username: "bob",
        email: null,
        phone: "13800000002",
        roleId: "role-staff",
        roleKey: "staff",
        roleName: "Staff",
        status: "active",
        joinedAt: new Date("2026-01-02T00:00:00Z"),
        userStatus: "active",
        effectiveOwnerCount: 1,
      },
    ];
    const additionalRoles = [
      { membershipId: "member-1", id: "role-books", key: "books", name: "Books" },
      { membershipId: "member-2", id: "role-reports", key: "reports", name: "Reports" },
    ];
    const selectedFields: Record<string, unknown>[] = [];
    const where = vi.fn().mockResolvedValueOnce(memberRows).mockResolvedValueOnce(additionalRoles);
    const query = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where,
    };
    const db = {
      select: vi.fn().mockImplementation((fields) => {
        selectedFields.push(fields);
        return query;
      }),
    };

    const result = await new IamRepository(db as never).listMembers("org-1");

    expect(
      result.map(({ username, roles: memberRoles }) => ({ username, roles: memberRoles })),
    ).toEqual([
      {
        username: "alice",
        roles: [
          { id: "role-owner", key: "owner", name: "Owner" },
          { id: "role-books", key: "books", name: "Books" },
        ],
      },
      {
        username: "bob",
        roles: [
          { id: "role-staff", key: "staff", name: "Staff" },
          { id: "role-reports", key: "reports", name: "Reports" },
        ],
      },
    ]);
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(query.from).toHaveBeenNthCalledWith(2, organizationMembershipRoles);
    expect(containsReference(selectedFields[1], organizationMembershipRoles.membershipId)).toBe(
      true,
    );
    expect(
      containsReference(query.innerJoin.mock.calls[2]?.[1], organizationMembershipRoles.roleId),
    ).toBe(true);
    expect(containsReference(where.mock.calls[0]?.[0], "org-1")).toBe(true);
    expect(containsReference(where.mock.calls[1]?.[0], "member-1")).toBe(true);
    expect(containsReference(where.mock.calls[1]?.[0], "member-2")).toBe(true);
  });

  it("新增成员时将第一个角色作为主角色并只写入其余角色", async () => {
    const membershipValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "member-1" }]),
    });
    const additionalRoleValues = vi.fn().mockResolvedValue(undefined);
    const executor = {
      insert: vi.fn((table) =>
        table === organizationMemberships
          ? { values: membershipValues }
          : { values: additionalRoleValues },
      ),
    };
    const repository = new IamRepository({} as never);
    vi.spyOn(repository, "findMemberById").mockResolvedValue({
      id: "member-1",
      organizationId: "org-1",
      userId: "user-1",
      username: "alice",
      email: null,
      phone: "13800000001",
      roleId: "role-owner",
      roleKey: "owner",
      roleName: "Owner",
      status: "active",
      joinedAt: new Date("2026-01-01T00:00:00Z"),
      roles: [{ id: "role-owner", key: "owner", name: "Owner" }],
    });

    await repository.createMember(
      {
        organizationId: "org-1",
        userId: "user-1",
        roleId: "role-owner",
        roleIds: ["role-owner", "role-books", "role-reports"],
        status: "active",
      },
      executor as never,
    );

    expect(membershipValues).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      roleId: "role-owner",
      status: "active",
    });
    expect(additionalRoleValues).toHaveBeenCalledWith([
      { membershipId: "member-1", roleId: "role-books" },
      { membershipId: "member-1", roleId: "role-reports" },
    ]);
  });

  it("旧式单角色更新会清空附加角色，而状态更新会保留它们", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where: updateWhere });
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const executor = {
      update: vi.fn().mockReturnValue({ set }),
      delete: vi.fn().mockReturnValue({ where: deleteWhere }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };
    const repository = new IamRepository({} as never);
    vi.spyOn(repository, "findMemberById").mockResolvedValue({
      id: "member-1",
      organizationId: "org-1",
      userId: "user-1",
      username: "alice",
      email: null,
      phone: null,
      roleId: "role-next",
      roleKey: "next",
      roleName: "Next",
      status: "active",
      joinedAt: new Date("2026-01-01T00:00:00Z"),
      roles: [{ id: "role-next", key: "next", name: "Next" }],
    });

    await repository.updateMember(
      { organizationId: "org-1", memberId: "member-1", roleId: "role-next" },
      executor as never,
    );
    expect(deleteWhere).toHaveBeenCalledOnce();
    expect(executor.insert).not.toHaveBeenCalled();

    deleteWhere.mockClear();
    executor.insert.mockClear();
    await repository.updateMember(
      { organizationId: "org-1", memberId: "member-1", status: "disabled" },
      executor as never,
    );
    expect(deleteWhere).not.toHaveBeenCalled();
    expect(executor.insert).not.toHaveBeenCalled();
    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({ status: "disabled" }));
  });

  it("统计附加角色的成员引用", async () => {
    const outerWhere = vi.fn().mockResolvedValue([{ value: 2 }]);
    const nestedWhere = vi.fn(
      (condition) =>
        sql`select ${organizationMembershipRoles.membershipId} from ${organizationMembershipRoles} where ${condition}`,
    );
    const db = {
      select: vi.fn((fields) => ({
        from: vi.fn().mockReturnValue({
          where: fields.value ? outerWhere : nestedWhere,
        }),
      })),
    };

    await expect(
      new IamRepository(db as never).countMembersUsingRole("org-1", "role-books"),
    ).resolves.toBe(2);

    const condition = outerWhere.mock.calls[0]?.[0];
    expect(containsReference(condition, organizationMembershipRoles.roleId)).toBe(true);
    const querySql = new (await import("drizzle-orm/pg-core")).PgDialect().sqlToQuery(condition);
    expect(querySql.params).toContain("org-1");
    expect(querySql.params).toContain("role-books");
  });
});
