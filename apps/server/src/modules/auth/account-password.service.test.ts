import { describe, expect, it, vi } from "vitest";
import type { SessionAuthContext } from "../../common/auth/session-auth-context.js";
import { AccountPasswordService } from "./account-password.service.js";

const context: SessionAuthContext = {
  accessScope: "organization",
  userId: "user",
  sessionId: "old",
  organizationId: "org",
  isSuperAdmin: false,
  permissions: [],
};
const input = { currentPassword: "old-password", newPassword: "new-password" };
function harness(platform = false) {
  const user = {
    id: "user",
    passwordHash: "hash:old-password",
    initialPasswordUnchanged: true,
    isSuperAdmin: platform,
  };
  const sessions = new Map([
    [
      "old",
      {
        id: "old",
        userId: "user",
        currentOrganizationId: platform ? null : "org",
        clientType: "app_ios",
        status: "active",
      },
    ],
    [
      "other",
      {
        id: "other",
        userId: "user",
        currentOrganizationId: platform ? null : "org",
        clientType: "app_ios",
        status: "active",
      },
    ],
  ]);
  const order: string[] = [];
  const tx = {};
  const auth = {
    lockActiveUser: vi.fn(async () => {
      order.push("user");
      return user;
    }),
    lockActiveSession: vi.fn(async () => {
      order.push("session");
      const session = sessions.get("old");
      return session?.status === "active" ? session : null;
    }),
    revokeAllUserSessions: vi.fn(async () => {
      for (const session of sessions.values()) session.status = "revoked";
    }),
    createRefreshSession: vi.fn(
      async (value: {
        userId: string;
        currentOrganizationId: string | null;
        clientType: string;
      }) => {
        const session = { ...value, id: "new", status: "active" };
        sessions.set("new", session);
        return session;
      },
    ),
  };
  const repository = {
    canUseOrganization: vi.fn().mockResolvedValue(true),
    updatePassword: vi.fn(async (_id: string, hash: string) => {
      user.passwordHash = hash;
      user.initialPasswordUnchanged = false;
    }),
  };
  const password = {
    hash: vi.fn(async (value: string) => `hash:${value}`),
    verify: vi.fn(async (hash: string, value: string) => hash === `hash:${value}`),
  };
  const token = {
    createRefreshToken: () => "fresh-refresh",
    hashRefreshToken: async (value: string) => `digest:${value}`,
    signAccessToken: vi.fn().mockResolvedValue("fresh-access"),
  };
  const audit = { appendRequired: vi.fn().mockResolvedValue(undefined) };
  let pending = Promise.resolve();
  const transactions = {
    run: (operation: (tx: object) => Promise<unknown>) => {
      const run = pending.then(async () => {
        const beforeUser = { ...user },
          beforeSessions = structuredClone(sessions);
        try {
          return await operation(tx);
        } catch (e) {
          Object.assign(user, beforeUser);
          sessions.clear();
          for (const [id, s] of beforeSessions) sessions.set(id, s);
          throw e;
        }
      });
      pending = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
  const service = new AccountPasswordService(
    auth as never,
    repository as never,
    password as never,
    token as never,
    { env: { REFRESH_TOKEN_TTL_DAYS: 30 } } as never,
    transactions as never,
    audit as never,
  );
  const ctx: SessionAuthContext = platform
    ? { ...context, accessScope: "platform", organizationId: null, isSuperAdmin: true }
    : context;
  return { service, ctx, user, sessions, repository, auth, token, audit, order, tx };
}
describe("AccountPasswordService", () => {
  it.each([
    "organization",
    "platform",
  ])("renews %s scope and revokes all old sessions atomically", async (scope) => {
    const h = harness(scope === "platform");
    await expect(h.service.changePassword(h.ctx, input)).resolves.toMatchObject({
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      clientType: "app_ios",
    });
    expect(h.user.passwordHash).toBe("hash:new-password");
    expect(h.user.initialPasswordUnchanged).toBe(false);
    expect(h.sessions.get("old")?.status).toBe("revoked");
    expect(h.sessions.get("other")?.status).toBe("revoked");
    expect(h.sessions.get("new")?.currentOrganizationId).toBe(h.ctx.organizationId);
    expect(h.order).toEqual(["user", "session"]);
    expect(h.audit.appendRequired).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.password.changed", actorUserId: "user" }),
      h.tx,
    );
  });
  it.each([
    { currentPassword: "wrong", newPassword: "new-password" },
    { currentPassword: "old-password", newPassword: "old-password" },
  ])("rejects incorrect or unchanged credentials without clearing the flag", async (value) => {
    const h = harness();
    await expect(h.service.changePassword(h.ctx, value)).rejects.toThrow();
    expect(h.repository.updatePassword).not.toHaveBeenCalled();
    expect(h.user.initialPasswordUnchanged).toBe(true);
    expect(h.sessions.get("old")?.status).toBe("active");
  });
  it("only allows one concurrent request using the old session and credentials", async () => {
    const h = harness();
    const result = await Promise.allSettled([
      h.service.changePassword(h.ctx, input),
      h.service.changePassword(h.ctx, input),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(h.auth.createRefreshSession).toHaveBeenCalledTimes(1);
  });
  it("rejects a lost organization target rather than granting platform scope", async () => {
    const h = harness();
    h.repository.canUseOrganization.mockResolvedValue(false);
    await expect(h.service.changePassword(h.ctx, input)).rejects.toThrow();
    expect(h.auth.createRefreshSession).not.toHaveBeenCalled();
  });
  it("rechecks the live super-admin qualification for platform scope", async () => {
    const h = harness(true);
    h.user.isSuperAdmin = false;
    await expect(h.service.changePassword(h.ctx, input)).rejects.toThrow();
    expect(h.repository.updatePassword).not.toHaveBeenCalled();
  });
  it("rolls back the password, flag and sessions when required audit fails", async () => {
    const h = harness();
    h.audit.appendRequired.mockRejectedValue(new Error("audit failed"));
    await expect(h.service.changePassword(h.ctx, input)).rejects.toThrow("audit failed");
    expect(h.user.passwordHash).toBe("hash:old-password");
    expect(h.user.initialPasswordUnchanged).toBe(true);
    expect(h.sessions.size).toBe(2);
    expect(h.sessions.get("old")?.status).toBe("active");
  });
});
