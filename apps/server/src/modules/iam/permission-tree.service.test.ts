import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { PermissionTreeService } from "./permission-tree.service.js";

const authContext: AuthContext = {
  userId: "actor-1",
  sessionId: "session-1",
  organizationId: "organization-1",
  isSuperAdmin: false,
  permissions: ["roles:permissions:update", "members:read", "members:create"],
};

const editableRole = {
  id: "role-1",
  organizationId: "organization-1",
  key: "staff",
  name: "Staff",
  description: "",
  isSystem: false,
  isEditable: true,
};

const menuRows = [
  {
    id: 1,
    organizationId: "organization-1",
    type: "menu" as const,
    name: "成员",
    parentId: null,
    routeKey: "Members",
    path: null,
    icon: "Users",
    permissionCode: "members:read",
    isExternal: false,
    isVisible: true,
    keepAlive: false,
    sortOrder: 1,
  },
  {
    id: 2,
    organizationId: "organization-1",
    type: "button" as const,
    name: "创建成员",
    parentId: 1,
    routeKey: null,
    path: null,
    icon: null,
    permissionCode: "members:create",
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: 2,
  },
];

const allPermissions = [
  {
    id: "permission-members-read",
    key: "members:read" as const,
    name: "查看成员",
    resource: "members",
    action: "read",
    description: "",
  },
  {
    id: "permission-members-create",
    key: "members:create" as const,
    name: "创建成员",
    resource: "members",
    action: "create",
    description: "",
  },
  {
    id: "permission-transactions-delete",
    key: "transactions:delete" as const,
    name: "删除交易",
    resource: "transactions",
    action: "delete",
    description: "",
  },
];

function createHarness(options: { auditFails?: boolean; role?: typeof editableRole | null } = {}) {
  const committed = {
    permissions: ["members:read", "transactions:delete"] as PermissionKey[],
    auditCount: 0,
  };
  const transaction = {
    id: "transaction-1",
    permissions: [...committed.permissions],
    auditCount: committed.auditCount,
  };
  const repository = {
    listPermissions: vi.fn().mockResolvedValue(allPermissions),
    lockRoleById: vi
      .fn()
      .mockResolvedValue(options.role === undefined ? editableRole : options.role),
    lockPermissionKeysForRole: vi.fn().mockImplementation(async () => [...transaction.permissions]),
    replaceRolePermissions: vi.fn().mockImplementation(async ({ permissionKeys }) => {
      transaction.permissions = [...permissionKeys];
    }),
  };
  const menuRepository = {
    listByOrganizationId: vi.fn().mockResolvedValue(menuRows),
  };
  const auditService = {
    appendRequired: vi.fn().mockImplementation(async (_input, executor) => {
      if (options.auditFails) {
        throw new Error("audit unavailable");
      }
      executor.auditCount += 1;
    }),
  };
  const transactions = {
    run: vi.fn().mockImplementation(async (operation: (value: object) => Promise<unknown>) => {
      transaction.permissions = [...committed.permissions];
      transaction.auditCount = committed.auditCount;
      const result = await operation(transaction);
      committed.permissions = [...transaction.permissions];
      committed.auditCount = transaction.auditCount;
      return result;
    }),
  };
  const service = new PermissionTreeService(
    repository as never,
    menuRepository as never,
    auditService as never,
    transactions as never,
  );

  return {
    auditService,
    committed,
    menuRepository,
    repository,
    service,
    transaction,
    transactions,
  };
}

describe("PermissionTreeService", () => {
  it("builds the current organization tree limited to the operator grant ceiling", async () => {
    const { menuRepository, repository, service } = createHarness();

    const result = await service.getPermissionTree(authContext);

    expect(menuRepository.listByOrganizationId).toHaveBeenCalledWith("organization-1");
    expect(repository.listPermissions).toHaveBeenCalledOnce();
    expect(
      result.flatMap((node) => [
        node.permissionCode,
        ...node.children.map((x) => x.permissionCode),
      ]),
    ).toContain("members:read");
    expect(JSON.stringify(result)).not.toContain("transactions:delete");
  });

  it("hides a child permission when its required ancestor is above the operator ceiling", async () => {
    const { service } = createHarness();

    const result = await service.getPermissionTree({
      ...authContext,
      permissions: ["roles:permissions:update", "members:create"],
    });

    expect(JSON.stringify(result)).not.toContain("members:create");
  });

  it("lets a super administrator manage the complete permission catalog", async () => {
    const { service } = createHarness();

    const result = await service.getPermissionTree({ ...authContext, isSuperAdmin: true });

    expect(JSON.stringify(result)).toContain("transactions:delete");
  });

  it("locks the organization-scoped role and permission rows before replacing only the manageable subset", async () => {
    const { auditService, committed, repository, service, transaction } = createHarness();

    await service.editRolePermissions(authContext, {
      roleId: "role-1",
      permissionKeys: ["members:read", "members:create"],
    });

    expect(repository.lockRoleById).toHaveBeenCalledWith("organization-1", "role-1", transaction);
    expect(repository.lockPermissionKeysForRole).toHaveBeenCalledWith("role-1", transaction);
    expect(repository.replaceRolePermissions).toHaveBeenCalledWith(
      {
        roleId: "role-1",
        permissionKeys: ["members:create", "members:read", "transactions:delete"],
      },
      transaction,
    );
    expect(repository.lockRoleById.mock.invocationCallOrder[0]).toBeLessThan(
      repository.lockPermissionKeysForRole.mock.invocationCallOrder[0] ?? 0,
    );
    expect(repository.lockPermissionKeysForRole.mock.invocationCallOrder[0]).toBeLessThan(
      repository.replaceRolePermissions.mock.invocationCallOrder[0] ?? 0,
    );
    expect(repository.replaceRolePermissions.mock.invocationCallOrder[0]).toBeLessThan(
      auditService.appendRequired.mock.invocationCallOrder[0] ?? 0,
    );
    expect(committed.permissions).toEqual([
      "members:create",
      "members:read",
      "transactions:delete",
    ]);
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        actorUserId: "actor-1",
        action: "role.permissions.changed",
        targetType: "role",
        targetId: "role-1",
        metadata: {
          manageableBefore: ["members:read"],
          manageableAfter: ["members:create", "members:read"],
        },
      }),
      transaction,
    );
  });

  it("rejects grants above the operator ceiling before opening a transaction", async () => {
    const { repository, service } = createHarness();

    await expect(
      service.editRolePermissions(authContext, {
        roleId: "role-1",
        permissionKeys: ["transactions:delete"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.lockRoleById).not.toHaveBeenCalled();
  });

  it("requires the role-permission update capability before reading or writing", async () => {
    const { menuRepository, repository, service, transactions } = createHarness();

    await expect(
      service.editRolePermissions(
        { ...authContext, permissions: ["members:read", "members:create"] },
        {
          roleId: "role-1",
          permissionKeys: [],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(menuRepository.listByOrganizationId).not.toHaveBeenCalled();
    expect(repository.listPermissions).not.toHaveBeenCalled();
    expect(transactions.run).not.toHaveBeenCalled();
  });

  it("rejects a requested child permission without its required ancestor", async () => {
    const { committed, repository, service } = createHarness();

    await expect(
      service.editRolePermissions(authContext, {
        roleId: "role-1",
        permissionKeys: ["members:create"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.replaceRolePermissions).not.toHaveBeenCalled();
    expect(committed.permissions).toEqual(["members:read", "transactions:delete"]);
  });

  it("returns not found for a role outside the current organization", async () => {
    const { repository, service } = createHarness({ role: null });

    await expect(
      service.editRolePermissions(authContext, {
        roleId: "other-role",
        permissionKeys: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.lockPermissionKeysForRole).not.toHaveBeenCalled();
  });

  it("does not commit permission replacement when required audit fails", async () => {
    const { committed, service } = createHarness({ auditFails: true });

    await expect(
      service.editRolePermissions(authContext, {
        roleId: "role-1",
        permissionKeys: ["members:read", "members:create"],
      }),
    ).rejects.toThrow("audit unavailable");
    expect(committed).toEqual({
      permissions: ["members:read", "transactions:delete"],
      auditCount: 0,
    });
  });
});
