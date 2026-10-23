import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AccessService } from "./access.service.js";

const payload = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "org-1",
};

describe("AccessService", () => {
  function createHarness() {
    const repository = {
      findActiveSession: vi.fn().mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        currentOrganizationId: "org-1",
      }),
      findActiveUser: vi.fn().mockResolvedValue({
        id: "user-1",
        isSuperAdmin: false,
      }),
      findActiveOrganization: vi.fn().mockResolvedValue({
        id: "org-1",
      }),
      findActiveMembership: vi.fn().mockResolvedValue({
        id: "member-1",
        userId: "user-1",
        organizationId: "org-1",
        roleId: "role-1",
      }),
      listPermissionKeysForRole: vi.fn().mockResolvedValue(["roles:update"]),
      listPermissionKeysForMembership: vi
        .fn()
        .mockResolvedValue(["roles:update", "members:read", "roles:update"]),
    };
    const service = new AccessService(repository as never);

    return { repository, service };
  }

  it("resolves auth context for an active member with role permissions", async () => {
    const { repository, service } = createHarness();

    await expect(service.resolveAuthContext(payload)).resolves.toEqual({
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-1",
      isSuperAdmin: false,
      permissions: ["roles:update", "members:read"],
    });
    expect(repository.listPermissionKeysForMembership).toHaveBeenCalledWith("member-1", undefined);
  });

  it("allows active member with required permission", async () => {
    const { service } = createHarness();
    const authContext = await service.resolveAuthContext(payload);

    expect(() => service.assertPermission(authContext, "roles:update")).not.toThrow();
  });

  it("rejects normal member without required permission", async () => {
    const { service } = createHarness();
    const authContext = await service.resolveAuthContext(payload);

    expect(() => service.assertPermission(authContext, "roles:delete")).toThrow(ForbiddenException);
  });

  it("allows super_admin active member without required permission", async () => {
    const { repository, service } = createHarness();
    repository.findActiveUser.mockResolvedValue({
      id: "user-1",
      isSuperAdmin: true,
    });
    repository.listPermissionKeysForRole.mockResolvedValue([]);

    const authContext = await service.resolveAuthContext(payload);

    expect(() => service.assertPermission(authContext, "roles:delete")).not.toThrow();
  });

  it("allows super_admin in an active organization without a fabricated membership", async () => {
    const { repository, service } = createHarness();
    repository.findActiveUser.mockResolvedValue({
      id: "user-1",
      isSuperAdmin: true,
    });
    repository.findActiveMembership.mockResolvedValue(null);

    await expect(service.resolveAuthContext(payload)).resolves.toMatchObject({
      organizationId: "org-1",
      isSuperAdmin: true,
    });
  });

  it("resolves a platform session for a super admin without any organization", async () => {
    const { repository, service } = createHarness();
    repository.findActiveUser.mockResolvedValue({ id: "user-1", isSuperAdmin: true });
    repository.findActiveOrganization.mockResolvedValue(null);
    repository.findActiveMembership.mockResolvedValue(null);
    expect(await service.resolveSessionContext({ ...payload, organizationId: null })).toMatchObject(
      { accessScope: "platform", organizationId: null, isSuperAdmin: true },
    );
  });

  it("rejects platform sessions after super admin privilege is revoked", async () => {
    const { repository, service } = createHarness();
    repository.findActiveUser.mockResolvedValue({ id: "user-1", isSuperAdmin: false });
    await expect(
      service.resolveSessionContext({ ...payload, organizationId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("never resolves platform tokens as an organization context", async () => {
    const { repository, service } = createHarness();
    repository.findActiveUser.mockResolvedValue({ id: "user-1", isSuperAdmin: true });
    await expect(
      service.resolveAuthContext({ ...payload, organizationId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects missing or inactive session as unauthenticated", async () => {
    const { repository, service } = createHarness();
    repository.findActiveSession.mockResolvedValue(null);

    await expect(service.resolveAuthContext(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects inactive organization as forbidden", async () => {
    const { repository, service } = createHarness();
    repository.findActiveOrganization.mockResolvedValue(null);

    await expect(service.resolveAuthContext(payload)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
