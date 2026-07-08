import { UnauthorizedException } from "@nestjs/common";
import type { ClientType } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { AuthService } from "./auth.service.js";

type TestSession = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  status: "active" | "revoked";
  currentOrganizationId: string;
  clientType: ClientType;
  expiresAt: Date;
};

const authContext: AuthContext = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "org-1",
  isSuperAdmin: false,
  permissions: [],
};

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`${label} is required`);
  }

  return value;
}

function requireSession(sessions: Map<string, TestSession>, sessionId: string): TestSession {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new Error(`${sessionId} is required`);
  }

  return session;
}

describe("AuthService", () => {
  function createHarness() {
    const now = new Date("2026-07-06T00:00:00.000Z");
    const sessions = new Map<string, TestSession>();
    let nextSessionId = 1;

    const repository = {
      findActiveUserByEmail: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "root@example.com",
        passwordHash: "hash",
        status: "active",
        isSuperAdmin: false,
        defaultOrganizationId: "org-1",
      }),
      createRefreshSession: vi.fn().mockImplementation(async (input) => {
        const session: TestSession = {
          id: `session-${nextSessionId++}`,
          userId: input.userId,
          refreshTokenHash: input.refreshTokenHash,
          status: "active",
          currentOrganizationId: input.currentOrganizationId,
          clientType: input.clientType,
          expiresAt: input.expiresAt,
        };
        sessions.set(session.id, session);
        return session;
      }),
      findActiveSessionByRefreshTokenHash: vi.fn().mockImplementation(async (hash: string) => {
        return (
          [...sessions.values()].find(
            (session) => session.refreshTokenHash === hash && session.status === "active",
          ) ?? null
        );
      }),
      findActiveSessionById: vi.fn().mockImplementation(async (sessionId: string) => {
        const session = sessions.get(sessionId);

        if (session?.status !== "active") {
          return null;
        }

        return session;
      }),
      updateRefreshSessionToken: vi
        .fn()
        .mockImplementation(async ({ sessionId, refreshTokenHash }) => {
          const session = sessions.get(sessionId);

          if (!session) {
            throw new Error("session not found");
          }

          sessions.set(sessionId, {
            ...session,
            refreshTokenHash,
          });
        }),
      revokeSession: vi.fn().mockImplementation(async (sessionId: string) => {
        const session = sessions.get(sessionId);

        if (session) {
          sessions.set(sessionId, { ...session, status: "revoked" });
        }
      }),
      revokeAllUserSessions: vi.fn().mockImplementation(async (userId: string) => {
        for (const session of sessions.values()) {
          if (session.userId === userId) {
            sessions.set(session.id, { ...session, status: "revoked" });
          }
        }
      }),
      listUserSessions: vi.fn().mockImplementation(async (userId: string) => {
        return [...sessions.values()].filter((session) => session.userId === userId);
      }),
    };
    const passwordService = { verify: vi.fn().mockResolvedValue(true) };
    const tokenService = {
      createRefreshToken: vi
        .fn()
        .mockReturnValueOnce("refresh-1")
        .mockReturnValueOnce("refresh-2")
        .mockReturnValueOnce("refresh-3"),
      hashRefreshToken: vi.fn().mockImplementation(async (token: string) => `hash:${token}`),
      verifyRefreshTokenHash: vi
        .fn()
        .mockImplementation(async (token: string, hash: string) => hash === `hash:${token}`),
      signAccessToken: vi
        .fn()
        .mockImplementation(
          async (payload) => `access:${payload.sessionId}:${payload.organizationId}`,
        ),
    };
    const config = {
      env: {
        REFRESH_TOKEN_TTL_DAYS: 30,
      },
    };
    const auditService = {
      append: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      repository as never,
      passwordService as never,
      tokenService as never,
      config as never,
      auditService as never,
    );

    return { auditService, service, sessions, repository, passwordService, tokenService, now };
  }

  it("creates an independent active session for every login", async () => {
    const { auditService, service, sessions } = createHarness();

    await service.login({ email: "root@example.com", password: "password", clientType: "web_pc" });
    await service.login({ email: "root@example.com", password: "password", clientType: "app_ios" });

    expect([...sessions.values()].filter((session) => session.status === "active")).toHaveLength(2);
    expect(sessions.get("session-1")?.currentOrganizationId).toBe("org-1");
    expect(sessions.get("session-2")?.clientType).toBe("app_ios");
    expect(auditService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.succeeded",
        actorUserId: "user-1",
        organizationId: "org-1",
        targetType: "session",
      }),
    );
  });

  it("rejects login when the password does not match", async () => {
    const { auditService, service, passwordService } = createHarness();
    passwordService.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: "root@example.com", password: "bad-password", clientType: "web_pc" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auditService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.failed",
        actorUserId: "user-1",
        organizationId: "org-1",
      }),
    );
  });

  it("rotates refresh token and rejects the old hash after refresh", async () => {
    const { service, sessions } = createHarness();

    const login = await service.login({
      email: "root@example.com",
      password: "password",
      clientType: "web_pc",
    });
    const refreshToken = requireValue(login.refreshToken, "login refreshToken");

    const refreshed = await service.refresh({ refreshToken });

    expect(refreshed.refreshToken).toBe("refresh-2");
    expect([...sessions.values()][0]?.refreshTokenHash).toBe("hash:refresh-2");
    await expect(service.refresh({ refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects revoked and expired sessions during refresh", async () => {
    const { service, sessions } = createHarness();

    const login = await service.login({
      email: "root@example.com",
      password: "password",
      clientType: "web_pc",
    });
    sessions.set("session-1", { ...requireSession(sessions, "session-1"), status: "revoked" });

    const refreshToken = requireValue(login.refreshToken, "login refreshToken");

    await expect(service.refresh({ refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);

    const secondLogin = await service.login({
      email: "root@example.com",
      password: "password",
      clientType: "app_ios",
    });
    sessions.set("session-2", {
      ...requireSession(sessions, "session-2"),
      expiresAt: new Date(Date.now() - 1),
    });

    const secondRefreshToken = requireValue(secondLogin.refreshToken, "second login refreshToken");

    await expect(service.refresh({ refreshToken: secondRefreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("revokes only the current session on logout", async () => {
    const { auditService, service, sessions } = createHarness();

    await service.login({ email: "root@example.com", password: "password", clientType: "web_pc" });
    await service.login({ email: "root@example.com", password: "password", clientType: "app_ios" });
    await service.logout(authContext);

    expect(sessions.get("session-1")?.status).toBe("revoked");
    expect(sessions.get("session-2")?.status).toBe("active");
    expect(auditService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.logout.succeeded",
        targetId: "session-1",
      }),
    );
  });

  it("revokes all active user sessions on revoke all", async () => {
    const { service, sessions } = createHarness();

    await service.login({ email: "root@example.com", password: "password", clientType: "web_pc" });
    await service.login({ email: "root@example.com", password: "password", clientType: "app_ios" });
    await service.revokeAllSessions(authContext);

    expect([...sessions.values()].every((session) => session.status === "revoked")).toBe(true);
  });

  it("does not revoke another user's session by id", async () => {
    const { service, sessions } = createHarness();

    await service.login({ email: "root@example.com", password: "password", clientType: "web_pc" });
    sessions.set("session-2", {
      id: "session-2",
      userId: "user-2",
      refreshTokenHash: "hash:other",
      status: "active",
      currentOrganizationId: "org-1",
      clientType: "web_pc",
      expiresAt: new Date("2026-08-06T00:00:00.000Z"),
    });

    await expect(service.revokeSession(authContext, "session-2")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.get("session-2")?.status).toBe("active");
  });
});
