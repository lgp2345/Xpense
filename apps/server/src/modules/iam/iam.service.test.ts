import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import type { UpdateRoleDto } from "./dto/update-role.dto.js";
import { IamService } from "./iam.service.js";

const authContext: AuthContext = {
  userId: "actor-1",
  sessionId: "session-1",
  organizationId: "org-1",
  isSuperAdmin: false,
  permissions: [
    "members:read",
    "members:update",
    "members:enable",
    "members:disable",
    "roles:permissions:update",
    "transactions:read",
    "transactions:create",
  ],
};

const editableRole = {
  id: "role-custom",
  organizationId: "org-1",
  key: "bookkeeper",
  name: "Bookkeeper",
  description: "Handles books",
  isSystem: false,
  isEditable: true,
};

const protectedRole = {
  id: "role-owner",
  organizationId: null,
  key: "owner",
  name: "Owner",
  description: "Owner",
  isSystem: true,
  isEditable: false,
};

const activeMember = {
  id: "member-1",
  organizationId: "org-1",
  userId: "user-1",
  email: "member@example.com",
  roleId: "role-custom",
  roleKey: "bookkeeper",
  roleName: "Bookkeeper",
  status: "active" as const,
  joinedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("IamService", () => {
  function createHarness() {
    const repository = {
      listMembers: vi.fn().mockResolvedValue([activeMember]),
      findMemberById: vi.fn().mockResolvedValue(activeMember),
      findMemberByOrganizationAndUser: vi.fn().mockResolvedValue(null),
      createMember: vi.fn().mockResolvedValue(activeMember),
      updateMember: vi.fn().mockResolvedValue(activeMember),
      revokeActiveSessionsForUserInOrganization: vi.fn().mockResolvedValue(undefined),
      listRoles: vi.fn().mockResolvedValue([editableRole, protectedRole]),
      findRoleById: vi.fn().mockResolvedValue(editableRole),
      findRoleByKey: vi.fn().mockResolvedValue(null),
      listPermissionKeysForRole: vi.fn().mockResolvedValue([]),
      createRole: vi.fn().mockResolvedValue(editableRole),
      updateRole: vi.fn().mockResolvedValue(editableRole),
      deleteRole: vi.fn().mockResolvedValue(undefined),
      replaceRolePermissions: vi.fn().mockResolvedValue(undefined),
      countMembersUsingRole: vi.fn().mockResolvedValue(0),
      listPermissions: vi.fn().mockResolvedValue([
        {
          id: "permission-1",
          key: "transactions:read" as PermissionKey,
          name: "transactions:read",
          resource: "transactions",
          action: "read",
          description: "transactions:read",
        },
      ]),
    };
    const auditService = {
      appendRequired: vi.fn().mockResolvedValue(undefined),
    };
    const transaction = { id: "transaction-1" };
    const transactions = {
      run: vi
        .fn()
        .mockImplementation((operation: (value: object) => Promise<unknown>) =>
          operation(transaction),
        ),
    };
    const accessService = {
      assertPermission: vi.fn((context: AuthContext, permission: PermissionKey) => {
        if (!context.isSuperAdmin && !context.permissions.includes(permission)) {
          throw new ForbiddenException();
        }
      }),
    };
    const ServiceWithAccess = IamService as unknown as new (
      repository: unknown,
      auditService: unknown,
      transactions: unknown,
      accessService: unknown,
    ) => IamService;
    const service = new ServiceWithAccess(repository, auditService, transactions, accessService);

    return { accessService, auditService, repository, service, transaction, transactions };
  }

  function createRollbackHarness() {
    const state = {
      memberCount: 0,
      memberRoleId: activeMember.roleId,
      roleCount: 0,
      roleExists: true,
      roleName: editableRole.name,
    };
    const repository = {
      listMembers: vi.fn().mockResolvedValue([activeMember]),
      findMemberById: vi.fn().mockResolvedValue(activeMember),
      findMemberByOrganizationAndUser: vi.fn().mockResolvedValue(null),
      createMember: vi.fn().mockImplementation(async () => {
        state.memberCount += 1;
        return activeMember;
      }),
      updateMember: vi.fn().mockImplementation(async ({ roleId }) => {
        state.memberRoleId = roleId ?? state.memberRoleId;
        return { ...activeMember, roleId: state.memberRoleId };
      }),
      revokeActiveSessionsForUserInOrganization: vi.fn().mockResolvedValue(undefined),
      listRoles: vi.fn().mockResolvedValue([editableRole]),
      findRoleById: vi.fn().mockResolvedValue(editableRole),
      findRoleByKey: vi.fn().mockResolvedValue(null),
      listPermissionKeysForRole: vi.fn().mockResolvedValue([]),
      createRole: vi.fn().mockImplementation(async () => {
        state.roleCount += 1;
        return editableRole;
      }),
      updateRole: vi.fn().mockImplementation(async ({ name }) => {
        state.roleName = name ?? state.roleName;
        return { ...editableRole, name: state.roleName };
      }),
      deleteRole: vi.fn().mockImplementation(async () => {
        state.roleExists = false;
      }),
      replaceRolePermissions: vi.fn().mockResolvedValue(undefined),
      countMembersUsingRole: vi.fn().mockResolvedValue(0),
      listPermissions: vi.fn().mockResolvedValue([]),
    };
    const auditService = {
      appendRequired: vi.fn().mockRejectedValue(new Error("audit unavailable")),
    };
    const transactionService = {
      run: vi
        .fn()
        .mockImplementation(async (operation: (transaction: object) => Promise<unknown>) => {
          const snapshot = { ...state };

          try {
            return await operation({ id: "transaction-1" });
          } catch (error) {
            Object.assign(state, snapshot);
            throw error;
          }
        }),
    };
    const accessService = {
      assertPermission: vi.fn(),
    };
    const ServiceWithAccess = IamService as unknown as new (
      repository: unknown,
      auditService: unknown,
      transactions: unknown,
      accessService: unknown,
    ) => IamService;
    const service = new ServiceWithAccess(
      repository,
      auditService,
      transactionService,
      accessService,
    );

    return { service, state };
  }

  it("uses authContext.organizationId for member queries", async () => {
    const { repository, service } = createHarness();

    await expect(service.listMembers(authContext)).resolves.toEqual([activeMember]);

    expect(repository.listMembers).toHaveBeenCalledWith("org-1");
  });

  it("creates a member in the current organization and rejects duplicates", async () => {
    const { auditService, repository, service, transaction } = createHarness();

    await expect(
      service.createMember(authContext, { userId: "user-1", roleId: "role-custom" }),
    ).resolves.toEqual(activeMember);
    expect(repository.createMember).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        userId: "user-1",
        roleId: "role-custom",
        status: "active",
      },
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "actor-1",
        action: "member.created",
        targetType: "member",
        targetId: "member-1",
        result: "succeeded",
      }),
      transaction,
    );

    repository.findMemberByOrganizationAndUser.mockResolvedValue(activeMember);

    await expect(
      service.createMember(authContext, { userId: "user-1", roleId: "role-custom" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("updates a member role in the current organization", async () => {
    const { repository, service, transaction } = createHarness();

    await service.updateMember(authContext, { id: "member-1", roleId: "role-next" });

    expect(repository.updateMember).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        memberId: "member-1",
        roleId: "role-next",
        status: undefined,
      },
      transaction,
    );
  });

  it("revokes current-organization sessions when disabling a member", async () => {
    const { repository, service, transaction } = createHarness();

    await service.updateMember(authContext, { id: "member-1", status: "disabled" });

    expect(repository.revokeActiveSessionsForUserInOrganization).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      transaction,
    );
  });

  it("uses the locked transaction state when disabling a concurrently changed member", async () => {
    const { repository, service, transaction } = createHarness();
    repository.findMemberById.mockImplementation(
      async (_organizationId: string, _memberId: string, executor?: object) =>
        executor ? activeMember : { ...activeMember, status: "disabled" as const },
    );

    await service.updateMember(authContext, { id: "member-1", status: "disabled" });

    expect(repository.findMemberById).toHaveBeenCalledWith("org-1", "member-1", transaction, true);
    expect(repository.revokeActiveSessionsForUserInOrganization).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      transaction,
    );
  });

  it("does not revoke sessions when enabling a member", async () => {
    const { repository, service } = createHarness();
    repository.findMemberById.mockResolvedValue({ ...activeMember, status: "disabled" });

    await service.updateMember(authContext, { id: "member-1", status: "active" });

    expect(repository.revokeActiveSessionsForUserInOrganization).not.toHaveBeenCalled();
  });

  it("requires members.update only when a member role is changed", async () => {
    const { repository, service } = createHarness();
    const withoutMemberUpdate = {
      ...authContext,
      permissions: ["members:disable"] as PermissionKey[],
    };

    await expect(
      service.updateMember(withoutMemberUpdate, { id: "member-1", roleId: "role-next" }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.updateMember).not.toHaveBeenCalled();
  });

  it.each([
    ["active", "members:enable"],
    ["disabled", "members:disable"],
  ] as const)("requires %s status changes to have %s", async (status, requiredPermission) => {
    const { accessService, repository, service } = createHarness();
    const withoutStatusPermission = {
      ...authContext,
      permissions: ["members:update"] as PermissionKey[],
    };

    await expect(
      service.updateMember(withoutStatusPermission, { id: "member-1", status }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(accessService.assertPermission).toHaveBeenCalledWith(
      withoutStatusPermission,
      requiredPermission,
    );
    expect(repository.updateMember).not.toHaveBeenCalled();
  });

  it("allows status-only changes without members.update", async () => {
    const { service } = createHarness();
    const statusOnlyContext = {
      ...authContext,
      permissions: ["members:disable"] as PermissionKey[],
    };

    await expect(
      service.updateMember(statusOnlyContext, { id: "member-1", status: "disabled" }),
    ).resolves.toEqual(activeMember);
  });

  it("requires every permission represented by a combined member update", async () => {
    const { repository, service } = createHarness();
    const roleOnlyContext = {
      ...authContext,
      permissions: ["members:update"] as PermissionKey[],
    };

    await expect(
      service.updateMember(roleOnlyContext, {
        id: "member-1",
        roleId: "role-next",
        status: "disabled",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.updateMember).not.toHaveBeenCalled();
  });

  it("creates roles and replaces their permissions", async () => {
    const { auditService, repository, service, transaction } = createHarness();

    await expect(
      service.createRole(authContext, {
        key: "bookkeeper",
        name: "Bookkeeper",
        description: "Handles books",
        permissionKeys: ["transactions:read", "transactions:create"],
      }),
    ).resolves.toEqual(editableRole);

    expect(repository.createRole).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        key: "bookkeeper",
        name: "Bookkeeper",
        description: "Handles books",
      },
      transaction,
    );
    expect(repository.replaceRolePermissions).toHaveBeenCalledWith(
      {
        roleId: "role-custom",
        permissionKeys: ["transactions:read", "transactions:create"],
      },
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "actor-1",
        action: "role.created",
        targetType: "role",
        targetId: "role-custom",
      }),
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "actor-1",
        action: "role.permissions.changed",
        targetType: "role",
        targetId: "role-custom",
      }),
      transaction,
    );
  });

  it("requires roles.permissions.update when creating a role with permissions", async () => {
    const { repository, service } = createHarness();
    const withoutPermissionUpdate = { ...authContext, permissions: [] };

    await expect(
      service.createRole(withoutPermissionUpdate, {
        key: "bookkeeper",
        name: "Bookkeeper",
        permissionKeys: ["transactions:read"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.createRole).not.toHaveBeenCalled();
    expect(repository.replaceRolePermissions).not.toHaveBeenCalled();
  });

  it("rejects creating a role with permissions the actor does not have", async () => {
    const { repository, service } = createHarness();
    const limitedContext = {
      ...authContext,
      permissions: ["roles:permissions:update"] as PermissionKey[],
    };

    await expect(
      service.createRole(limitedContext, {
        key: "administrator",
        name: "Administrator",
        permissionKeys: ["transactions:delete"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.createRole).not.toHaveBeenCalled();
  });

  it.each([
    { permissionKeys: [] as PermissionKey[] },
    { permissionKeys: ["transactions:delete"] as PermissionKey[] },
  ])("rejects the legacy permissionKeys field in role profile updates: $permissionKeys", async ({
    permissionKeys,
  }) => {
    const { auditService, repository, service, transactions } = createHarness();
    const legacyPayload = {
      id: "role-custom",
      name: "Ledger Owner",
      permissionKeys,
    } as unknown as UpdateRoleDto;

    await expect(service.updateRole(authContext, legacyPayload)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(transactions.run).not.toHaveBeenCalled();
    expect(repository.updateRole).not.toHaveBeenCalled();
    expect(repository.replaceRolePermissions).not.toHaveBeenCalled();
    expect(auditService.appendRequired).not.toHaveBeenCalled();
  });

  it("does not inspect permission ceilings during valid role profile updates", async () => {
    const { repository, service } = createHarness();
    const limitedContext = {
      ...authContext,
      permissions: ["roles:permissions:update"] as PermissionKey[],
    };

    await expect(
      service.updateRole(limitedContext, { id: "role-custom", name: "Ledger Owner" }),
    ).resolves.toEqual(editableRole);

    expect(repository.updateRole).toHaveBeenCalled();
    expect(repository.replaceRolePermissions).not.toHaveBeenCalled();
  });

  it("rejects creating a member with a role above the actor's permission ceiling", async () => {
    const { repository, service } = createHarness();
    repository.listPermissionKeysForRole.mockResolvedValue(["transactions:delete"]);
    const limitedContext = {
      ...authContext,
      permissions: ["members:create"] as PermissionKey[],
    };

    await expect(
      service.createMember(limitedContext, { userId: "user-1", roleId: "role-custom" }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.createMember).not.toHaveBeenCalled();
  });

  it("rejects assigning a member role above the actor's permission ceiling", async () => {
    const { repository, service } = createHarness();
    repository.listPermissionKeysForRole.mockResolvedValue(["transactions:delete"]);
    const limitedContext = {
      ...authContext,
      permissions: ["members:update"] as PermissionKey[],
    };

    await expect(
      service.updateMember(limitedContext, { id: "member-1", roleId: "role-next" }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.updateMember).not.toHaveBeenCalled();
  });

  it("allows super admins to grant and assign permissions above their role", async () => {
    const { repository, service } = createHarness();
    repository.listPermissionKeysForRole.mockResolvedValue(["transactions:delete"]);
    const superAdminContext = {
      ...authContext,
      isSuperAdmin: true,
      permissions: [] as PermissionKey[],
    };

    await expect(
      service.createRole(superAdminContext, {
        key: "administrator",
        name: "Administrator",
        permissionKeys: ["transactions:delete"],
      }),
    ).resolves.toEqual(editableRole);
    await expect(
      service.createMember(superAdminContext, { userId: "user-1", roleId: "role-custom" }),
    ).resolves.toEqual(activeMember);
  });

  it("blocks IAM mutation success when required audit write fails", async () => {
    const { auditService, service } = createHarness();
    auditService.appendRequired.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      service.createRole(authContext, {
        key: "bookkeeper",
        name: "Bookkeeper",
        permissionKeys: [],
      }),
    ).rejects.toThrow("audit unavailable");
  });

  it("rolls back member creation when its required audit write fails", async () => {
    const { service, state } = createRollbackHarness();

    await expect(
      service.createMember(authContext, { userId: "user-1", roleId: "role-custom" }),
    ).rejects.toThrow("audit unavailable");

    expect(state.memberCount).toBe(0);
  });

  it("rolls back member updates when their required audit write fails", async () => {
    const { service, state } = createRollbackHarness();

    await expect(
      service.updateMember(authContext, { id: "member-1", roleId: "role-next" }),
    ).rejects.toThrow("audit unavailable");

    expect(state.memberRoleId).toBe("role-custom");
  });

  it("rolls back role creation when its required audit write fails", async () => {
    const { service, state } = createRollbackHarness();

    await expect(
      service.createRole(authContext, {
        key: "bookkeeper",
        name: "Bookkeeper",
        permissionKeys: [],
      }),
    ).rejects.toThrow("audit unavailable");

    expect(state.roleCount).toBe(0);
  });

  it("rolls back role updates when their required audit write fails", async () => {
    const { service, state } = createRollbackHarness();

    await expect(
      service.updateRole(authContext, { id: "role-custom", name: "Ledger Owner" }),
    ).rejects.toThrow("audit unavailable");

    expect(state.roleName).toBe("Bookkeeper");
  });

  it("rolls back role deletion when its required audit write fails", async () => {
    const { service, state } = createRollbackHarness();

    await expect(service.deleteRole(authContext, { id: "role-custom" })).rejects.toThrow(
      "audit unavailable",
    );

    expect(state.roleExists).toBe(true);
  });

  it("rejects duplicate role keys in the current organization", async () => {
    const { repository, service } = createHarness();
    repository.findRoleByKey.mockResolvedValue(editableRole);

    await expect(
      service.createRole(authContext, {
        key: "bookkeeper",
        name: "Bookkeeper",
        permissionKeys: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects updating non-editable system roles", async () => {
    const { repository, service } = createHarness();
    repository.findRoleById.mockResolvedValue(protectedRole);

    await expect(
      service.updateRole(authContext, { id: "role-owner", name: "Owner Plus" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("updates editable role details without writing permission changes or permission audits", async () => {
    const { auditService, repository, service, transaction } = createHarness();

    await service.updateRole(authContext, { id: "role-custom", name: "Ledger Owner" });

    expect(repository.updateRole).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        roleId: "role-custom",
        name: "Ledger Owner",
        description: undefined,
      },
      transaction,
    );
    expect(repository.replaceRolePermissions).not.toHaveBeenCalled();
    expect(auditService.appendRequired).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.permissions.changed" }),
      expect.anything(),
    );
  });

  it("rejects deleting protected or assigned roles", async () => {
    const { repository, service } = createHarness();
    repository.findRoleById.mockResolvedValueOnce(protectedRole);

    await expect(service.deleteRole(authContext, { id: "role-owner" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    repository.findRoleById.mockResolvedValue(editableRole);
    repository.countMembersUsingRole.mockResolvedValue(1);

    await expect(service.deleteRole(authContext, { id: "role-custom" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("deletes editable unassigned roles from the current organization", async () => {
    const { repository, service, transaction } = createHarness();

    await expect(service.deleteRole(authContext, { id: "role-custom" })).resolves.toBeUndefined();

    expect(repository.deleteRole).toHaveBeenCalledWith("org-1", "role-custom", transaction);
  });

  it("lists permissions through the repository", async () => {
    const { repository, service } = createHarness();

    await service.listPermissions(authContext);

    expect(repository.listPermissions).toHaveBeenCalled();
  });

  it("returns not found when a member or role is outside the current organization", async () => {
    const { repository, service } = createHarness();
    repository.findMemberById.mockResolvedValueOnce(null);
    repository.findRoleById.mockResolvedValueOnce(null);

    await expect(
      service.updateMember(authContext, { id: "missing-member" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateRole(authContext, { id: "missing-role" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("uses project API error codes for service errors", async () => {
    const { repository, service } = createHarness();
    repository.findMemberByOrganizationAndUser.mockResolvedValue(activeMember);

    try {
      await service.createMember(authContext, { userId: "user-1", roleId: "role-custom" });
    } catch (error) {
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: apiErrorCodes.conflict,
      });
    }
  });
});
