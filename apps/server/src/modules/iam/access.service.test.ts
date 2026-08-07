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
        userId: "user-1",
        organizationId: "org-1",
        roleId: "role-1",
      }),
      listPermissionKeysForRole: vi.fn().mockResolvedValue(["roles:update"]),
    };
    const service = new AccessService(repository as never);

    return { repository, service };
  }

  it("resolves auth context for an active member with role permissions", async () => {
    const { service } = createHarness();

    await expect(service.resolveAuthContext(payload)).resolves.toEqual({
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-1",
      isSuperAdmin: false,
      permissions: ["roles:update"],
    });
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

  it("rejects super_admin when not an active organization member", async () => {
    const { repository, service } = createHarness();
    repository.findActiveUser.mockResolvedValue({
      id: "user-1",
      isSuperAdmin: true,
    });
    repository.findActiveMembership.mockResolvedValue(null);

    await expect(service.resolveAuthContext(payload)).rejects.toBeInstanceOf(ForbiddenException);
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
