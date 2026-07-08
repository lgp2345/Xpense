import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { OrganizationsService } from "./organizations.service.js";

type TestSession = {
  id: string;
  userId: string;
  currentOrganizationId: string;
};

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "org-a",
  isSuperAdmin: false,
  permissions: [],
};

describe("OrganizationsService", () => {
  function createHarness() {
    const sessions = new Map<string, TestSession>([
      ["session-1", { id: "session-1", userId: "user-1", currentOrganizationId: "org-a" }],
      ["session-2", { id: "session-2", userId: "user-1", currentOrganizationId: "org-a" }],
    ]);
    const activeMemberships = new Set(["user-1:org-a", "user-1:org-b"]);
    const organizations = [
      { id: "org-a", name: "Org A", status: "active" as const },
      { id: "org-b", name: "Org B", status: "active" as const },
    ];

    const repository = {
      listActiveOrganizationsForUser: vi.fn().mockImplementation(async (userId: string) => {
        return organizations.filter((organization) =>
          activeMemberships.has(`${userId}:${organization.id}`),
        );
      }),
      findActiveMembership: vi
        .fn()
        .mockImplementation(async (userId: string, organizationId: string) => {
          if (!activeMemberships.has(`${userId}:${organizationId}`)) {
            return null;
          }

          const organization = organizations.find((item) => item.id === organizationId);

          return organization ? { userId, organizationId, organization } : null;
        }),
      updateSessionOrganization: vi
        .fn()
        .mockImplementation(async (sessionId: string, organizationId: string) => {
          const session = sessions.get(sessionId);

          if (session) {
            sessions.set(sessionId, { ...session, currentOrganizationId: organizationId });
          }
        }),
    };
    const tokenService = {
      signAccessToken: vi
        .fn()
        .mockImplementation(
          async (payload) => `access:${payload.sessionId}:${payload.organizationId}`,
        ),
    };
    const auditService = {
      append: vi.fn().mockResolvedValue(undefined),
    };
    const service = new OrganizationsService(
      repository as never,
      tokenService as never,
      auditService as never,
    );

    return { auditService, service, sessions, repository, tokenService, activeMemberships };
  }

  it("lists active organizations for the current user", async () => {
    const { service } = createHarness();

    await expect(service.listOrganizations(authContext)).resolves.toEqual([
      { id: "org-a", name: "Org A", status: "active" },
      { id: "org-b", name: "Org B", status: "active" },
    ]);
  });

  it("switches current organization only for the current session", async () => {
    const { auditService, service, sessions, tokenService } = createHarness();

    await expect(service.switchCurrentOrganization(authContext, "org-b")).resolves.toEqual({
      accessToken: "access:session-1:org-b",
    });

    expect(sessions.get("session-1")?.currentOrganizationId).toBe("org-b");
    expect(sessions.get("session-2")?.currentOrganizationId).toBe("org-a");
    expect(tokenService.signAccessToken).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-b",
    });
    expect(auditService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "organization.switched",
        actorUserId: "user-1",
        organizationId: "org-b",
        targetType: "organization",
        targetId: "org-b",
      }),
    );
  });

  it("rejects switching to an organization where the user is not active member", async () => {
    const { service, sessions, activeMemberships } = createHarness();
    activeMemberships.delete("user-1:org-b");

    await expect(service.switchCurrentOrganization(authContext, "org-b")).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(sessions.get("session-1")?.currentOrganizationId).toBe("org-a");
  });
});
