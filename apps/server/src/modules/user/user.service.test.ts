import { ForbiddenException } from "@nestjs/common";
import { permissionKeys } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { UserService } from "./user.service.js";

const authContext: SessionAuthContext = {
  accessScope: "organization",
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "org-1",
  isSuperAdmin: false,
  permissions: ["roles:read"],
};

describe("UserService", () => {
  function createHarness() {
    const repository = {
      findCurrentUserContext: vi.fn().mockResolvedValue({
        accessScope: "organization",
        user: {
          initialPasswordUnchanged: true,
          id: "user-1",
          email: "a@example.com",
          phone: null,
          isSuperAdmin: false,
          status: "active",
        },
        organization: {
          status: "active",
          baseCurrency: "CNY",
          timezone: "Asia/Shanghai",
          id: "org-1",
          name: "Org",
        },
        role: {
          id: "role-1",
          key: "admin",
          name: "Admin",
        },
        session: {
          id: "session-1",
          clientType: "web_pc",
        },
      }),
      listPermissionKeysForRole: vi.fn().mockResolvedValue(["roles:read"]),
    };
    const service = new UserService(repository as never);

    return { repository, service };
  }

  it("returns current organization permission context for a normal user", async () => {
    const { service } = createHarness();

    await expect(service.getCurrentUser(authContext)).resolves.toEqual({
      accessScope: "organization",
      user: {
        initialPasswordUnchanged: true,
        id: "user-1",
        email: "a@example.com",
        phone: null,
        isSuperAdmin: false,
        status: "active",
      },
      organization: {
        status: "active",
        baseCurrency: "CNY",
        timezone: "Asia/Shanghai",
        id: "org-1",
        name: "Org",
      },
      role: {
        id: "role-1",
        key: "admin",
        name: "Admin",
      },
      permissions: ["roles:read"],
      session: {
        id: "session-1",
        clientType: "web_pc",
      },
    });
  });

  it("returns all permissions for a super_admin active member", async () => {
    const { repository, service } = createHarness();
    repository.findCurrentUserContext.mockResolvedValue({
      accessScope: "organization",
      user: {
        initialPasswordUnchanged: true,
        id: "user-1",
        email: "root@example.com",
        phone: null,
        isSuperAdmin: true,
        status: "active",
      },
      organization: {
        status: "active",
        baseCurrency: "CNY",
        timezone: "Asia/Shanghai",
        id: "org-1",
        name: "Org",
      },
      role: {
        id: "role-1",
        key: "owner",
        name: "Owner",
      },
      session: {
        id: "session-1",
        clientType: "web_pc",
      },
    });
    repository.listPermissionKeysForRole.mockResolvedValue([]);

    const response = await service.getCurrentUser({
      ...authContext,
      isSuperAdmin: true,
      permissions: [],
    });

    expect(response.permissions.toSorted()).toEqual([...permissionKeys].sort());
  });

  it("rejects when current user context cannot be resolved", async () => {
    const { repository, service } = createHarness();
    repository.findCurrentUserContext.mockResolvedValue(null);

    await expect(service.getCurrentUser(authContext)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
