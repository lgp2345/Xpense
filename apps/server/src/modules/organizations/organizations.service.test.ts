import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { OrganizationsService } from "./organizations.service.js";

const authContext: SessionAuthContext = {
  accessScope: "organization",
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "org-a",
  isSuperAdmin: false,
  permissions: [],
};
function createHarness(isSuperAdmin = false) {
  const transaction = {};
  const sessions = new Map([
    ["session-1", { id: "session-1", currentOrganizationId: "org-a" }],
    ["session-2", { id: "session-2", currentOrganizationId: "org-a" }],
  ]);
  const user = { id: "user-1", isSuperAdmin, lastOrganizationId: "org-a" };
  const activeMemberships = new Set(["org-a", "org-b"]);
  const organizations = [
    { id: "org-a", name: "A", status: "active" },
    { id: "org-b", name: "B", status: "active" },
  ];
  const lockOrder: string[] = [];
  const repository = {
    listActiveOrganizationsForUser: vi.fn().mockResolvedValue(organizations),
    findActiveMembership: vi
      .fn()
      .mockImplementation(async (_userId, organizationId) =>
        activeMemberships.has(organizationId)
          ? organizations.find((o) => o.id === organizationId)
          : null,
      ),
    findActiveOrganization: vi
      .fn()
      .mockImplementation(
        async (organizationId) => organizations.find((o) => o.id === organizationId) ?? null,
      ),
  };
  const authRepository = {
    lockActiveUser: vi.fn().mockImplementation(async () => {
      lockOrder.push("user");
      return user;
    }),
    lockActiveSession: vi.fn().mockImplementation(async (context) => {
      lockOrder.push("session");
      const session = sessions.get(context.sessionId);
      return session?.currentOrganizationId === context.organizationId ? session : null;
    }),
    updateSessionOrganization: vi.fn().mockImplementation(async (id, currentOrganizationId) => {
      const session = sessions.get(id);
      if (session) sessions.set(id, { ...session, currentOrganizationId });
    }),
    updateLastOrganization: vi.fn().mockImplementation(async (_id, organizationId) => {
      user.lastOrganizationId = organizationId;
    }),
  };
  const tokenService = {
    signAccessToken: vi
      .fn()
      .mockImplementation(
        async (payload) => `access:${payload.sessionId}:${payload.organizationId}`,
      ),
  };
  const auditService = { appendRequired: vi.fn().mockResolvedValue(undefined) };
  const transactions = {
    run: async (operation: (tx: object) => Promise<unknown>) => {
      const before = structuredClone(sessions);
      const preference = user.lastOrganizationId;
      try {
        return await operation(transaction);
      } catch (error) {
        sessions.clear();
        for (const [key, value] of before) sessions.set(key, value);
        user.lastOrganizationId = preference;
        throw error;
      }
    },
  };
  const service = new OrganizationsService(
    repository as never,
    tokenService as never,
    auditService as never,
    authRepository as never,
    transactions as never,
  );
  return {
    service,
    sessions,
    user,
    activeMemberships,
    repository,
    authRepository,
    tokenService,
    auditService,
    transaction,
    lockOrder,
  };
}

describe("OrganizationsService", () => {
  it("lists only the user's memberships even in platform scope", async () => {
    const { service, repository } = createHarness(true);
    await service.listOrganizations({
      ...authContext,
      isSuperAdmin: true,
      accessScope: "platform",
      organizationId: null,
    });
    expect(repository.listActiveOrganizationsForUser).toHaveBeenCalledWith("user-1");
  });

  it("commits the current session and shared preference, preserving other device targets", async () => {
    const { service, sessions, user, auditService, authRepository, transaction, lockOrder } =
      createHarness();
    expect(await service.switchCurrentOrganization(authContext, "org-b")).toEqual({
      accessToken: "access:session-1:org-b",
    });
    expect(sessions.get("session-1")?.currentOrganizationId).toBe("org-b");
    expect(sessions.get("session-2")?.currentOrganizationId).toBe("org-a");
    expect(user.lastOrganizationId).toBe("org-b");
    expect(lockOrder).toEqual(["user", "session"]);
    expect(authRepository.updateLastOrganization).toHaveBeenCalledWith(
      "user-1",
      "org-b",
      transaction,
    );
    expect(auditService.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        organizationId: "org-b",
        action: "organization.switched",
        metadata: { fromOrganizationId: "org-a", accessSource: "membership" },
      }),
      transaction,
    );
  });

  it("keeps both session and preference when the target membership is unavailable", async () => {
    const { service, sessions, user, activeMemberships, authRepository } = createHarness();
    activeMemberships.delete("org-b");
    await expect(service.switchCurrentOrganization(authContext, "org-b")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(sessions.get("session-1")?.currentOrganizationId).toBe("org-a");
    expect(user.lastOrganizationId).toBe("org-a");
    expect(authRepository.updateLastOrganization).not.toHaveBeenCalled();
  });

  it("lets a live super admin enter an organization without updating membership preference", async () => {
    const { service, repository, authRepository, activeMemberships, user } = createHarness(true);
    activeMemberships.clear();
    await service.switchCurrentOrganization({ ...authContext, isSuperAdmin: true }, "org-b");
    expect(repository.findActiveMembership).not.toHaveBeenCalled();
    expect(authRepository.updateLastOrganization).not.toHaveBeenCalled();
    expect(user.lastOrganizationId).toBe("org-a");
  });

  it("rechecks the live privilege after a guard had observed super-admin access", async () => {
    const { service, activeMemberships } = createHarness(false);
    activeMemberships.clear();
    await expect(
      service.switchCurrentOrganization({ ...authContext, isSuperAdmin: true }, "org-b"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a stale target or revoked session instead of restoring it", async () => {
    const { service, sessions } = createHarness();
    sessions.delete("session-1");
    await expect(service.switchCurrentOrganization(authContext, "org-b")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    "audit",
    "signing",
  ])("rolls back session and preference on %s failure", async (failure) => {
    const { service, sessions, user, tokenService, auditService } = createHarness();
    if (failure === "audit")
      auditService.appendRequired.mockRejectedValue(new Error("audit unavailable"));
    else tokenService.signAccessToken.mockRejectedValue(new Error("signing unavailable"));
    await expect(service.switchCurrentOrganization(authContext, "org-b")).rejects.toThrow(
      "unavailable",
    );
    expect(user.lastOrganizationId).toBe("org-a");
    expect(sessions.get("session-1")?.currentOrganizationId).toBe("org-a");
  });
});
