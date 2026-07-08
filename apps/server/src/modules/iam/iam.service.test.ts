import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { apiErrorCodes } from "../../common/errors/api-error.js";
import { IamService } from "./iam.service.js";

const authContext: AuthContext = {
  userId: "actor-1",
  sessionId: "session-1",
  organizationId: "org-1",
  isSuperAdmin: false,
  permissions: ["members.read"],
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
      createRole: vi.fn().mockResolvedValue(editableRole),
      updateRole: vi.fn().mockResolvedValue(editableRole),
      deleteRole: vi.fn().mockResolvedValue(undefined),
      replaceRolePermissions: vi.fn().mockResolvedValue(undefined),
      countMembersUsingRole: vi.fn().mockResolvedValue(0),
      listPermissions: vi.fn().mockResolvedValue([
        {
          id: "permission-1",
          key: "transactions.read" as PermissionKey,
          name: "transactions.read",
          resource: "transactions",
          action: "read",
          description: "transactions.read",
        },
      ]),
    };
    const auditService = {
      appendRequired: vi.fn().mockResolvedValue(undefined),
    };
    const service = new IamService(repository as never, auditService as never);

    return { auditService, repository, service };
  }

  it("uses authContext.organizationId for member queries", async () => {
    const { repository, service } = createHarness();

    await expect(service.listMembers(authContext)).resolves.toEqual([activeMember]);

    expect(repository.listMembers).toHaveBeenCalledWith("org-1");
  });

  it("creates a member in the current organization and rejects duplicates", async () => {
    const { auditService, repository, service } = createHarness();

    await expect(
      service.createMember(authContext, { userId: "user-1", roleId: "role-custom" }),
    ).resolves.toEqual(activeMember);
    expect(repository.createMember).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      roleId: "role-custom",
      status: "active",
    });
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "actor-1",
        action: "member.created",
        targetType: "member",
        targetId: "member-1",
        result: "succeeded",
      }),
    );

    repository.findMemberByOrganizationAndUser.mockResolvedValue(activeMember);

    await expect(
      service.createMember(authContext, { userId: "user-1", roleId: "role-custom" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("updates a member role in the current organization", async () => {
    const { repository, service } = createHarness();

    await service.updateMember(authContext, "member-1", { roleId: "role-next" });

    expect(repository.updateMember).toHaveBeenCalledWith({
      organizationId: "org-1",
      memberId: "member-1",
      roleId: "role-next",
      status: undefined,
    });
  });

  it("revokes current-organization sessions when disabling a member", async () => {
    const { repository, service } = createHarness();

    await service.updateMember(authContext, "member-1", { status: "disabled" });

    expect(repository.revokeActiveSessionsForUserInOrganization).toHaveBeenCalledWith(
      "user-1",
      "org-1",
    );
  });

  it("does not revoke sessions when enabling a member", async () => {
    const { repository, service } = createHarness();
    repository.findMemberById.mockResolvedValue({ ...activeMember, status: "disabled" });

    await service.updateMember(authContext, "member-1", { status: "active" });

    expect(repository.revokeActiveSessionsForUserInOrganization).not.toHaveBeenCalled();
  });

  it("creates roles and replaces their permissions", async () => {
    const { auditService, repository, service } = createHarness();

    await expect(
      service.createRole(authContext, {
        key: "bookkeeper",
        name: "Bookkeeper",
        description: "Handles books",
        permissionKeys: ["transactions.read", "transactions.create"],
      }),
    ).resolves.toEqual(editableRole);

    expect(repository.createRole).toHaveBeenCalledWith({
      organizationId: "org-1",
      key: "bookkeeper",
      name: "Bookkeeper",
      description: "Handles books",
    });
    expect(repository.replaceRolePermissions).toHaveBeenCalledWith({
      roleId: "role-custom",
      permissionKeys: ["transactions.read", "transactions.create"],
    });
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "actor-1",
        action: "role.created",
        targetType: "role",
        targetId: "role-custom",
      }),
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "actor-1",
        action: "role.permissions.changed",
        targetType: "role",
        targetId: "role-custom",
      }),
    );
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
      service.updateRole(authContext, "role-owner", {
        name: "Owner Plus",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("updates editable role details and permissions", async () => {
    const { repository, service } = createHarness();

    await service.updateRole(authContext, "role-custom", {
      name: "Ledger Owner",
      permissionKeys: ["transactions.read"],
    });

    expect(repository.updateRole).toHaveBeenCalledWith({
      organizationId: "org-1",
      roleId: "role-custom",
      name: "Ledger Owner",
      description: undefined,
    });
    expect(repository.replaceRolePermissions).toHaveBeenCalledWith({
      roleId: "role-custom",
      permissionKeys: ["transactions.read"],
    });
  });

  it("rejects deleting protected or assigned roles", async () => {
    const { repository, service } = createHarness();
    repository.findRoleById.mockResolvedValueOnce(protectedRole);

    await expect(service.deleteRole(authContext, "role-owner")).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    repository.findRoleById.mockResolvedValue(editableRole);
    repository.countMembersUsingRole.mockResolvedValue(1);

    await expect(service.deleteRole(authContext, "role-custom")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("deletes editable unassigned roles from the current organization", async () => {
    const { repository, service } = createHarness();

    await expect(service.deleteRole(authContext, "role-custom")).resolves.toBeUndefined();

    expect(repository.deleteRole).toHaveBeenCalledWith("org-1", "role-custom");
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

    await expect(service.updateMember(authContext, "missing-member", {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.updateRole(authContext, "missing-role", {})).rejects.toBeInstanceOf(
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
