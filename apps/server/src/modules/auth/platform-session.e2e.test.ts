import { afterEach, describe, expect, it } from "vitest";
import { TEST_CAPTCHA, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";

describe("platform session boundary", () => {
  let harness: TestAppHarness;
  afterEach(async () => {
    await harness?.app.close();
  });
  async function platformLogin() {
    harness = await createTestApp();
    const result = await harness.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        ...TEST_CAPTCHA,
        phone: TEST_PHONES.superNonMember,
        password: "password",
        clientType: "app_ios",
      },
    });
    expect(result.statusCode).toBe(200);
    return result.json().data as { accessToken: string; refreshToken: string };
  }

  it("allows a non-member super admin to login, read account, refresh and logout without organization access", async () => {
    const tokens = await platformLogin();
    const headers = { authorization: `Bearer ${tokens.accessToken}` };
    const user = await harness.app.inject({ method: "GET", url: "/api/user", headers });
    expect(user.statusCode).toBe(200);
    expect(user.json().data).toMatchObject({
      accessScope: "platform",
      organization: null,
      role: null,
      permissions: [],
      user: {
        id: testIds.superNonMemberUser,
        phone: TEST_PHONES.superNonMember,
        initialPasswordUnchanged: true,
      },
    });
    const denied = await harness.app.inject({ method: "GET", url: "/api/roles/list", headers });
    expect(denied.statusCode).toBe(403);
    const sessions = await harness.app.inject({
      method: "GET",
      url: "/api/auth/sessions",
      headers,
    });
    expect(sessions.statusCode).toBe(200);
    const refresh = await harness.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(refresh.statusCode).toBe(200);
    expect(
      [...harness.state.sessions.values()]
        .filter(
          (s) => s.userId === testIds.superNonMemberUser && s.id !== "session-super-non-member",
        )
        .every((s) => s.currentOrganizationId === null),
    ).toBe(true);
    const refreshed = refresh.json().data;
    const logout = await harness.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: `Bearer ${refreshed.accessToken}` },
    });
    expect(logout.statusCode).toBe(200);
    const retry = await harness.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: refreshed.refreshToken },
    });
    expect(retry.statusCode).toBe(401);
  });

  it("revokes platform access and refresh when super-admin privilege is removed", async () => {
    const tokens = await platformLogin();
    const user = harness.state.users.get(testIds.superNonMemberUser);
    if (!user) throw new Error("Expected super-admin fixture");
    harness.state.users.set(user.id, { ...user, isSuperAdmin: false });
    expect(
      (
        await harness.app.inject({
          method: "GET",
          url: "/api/user",
          headers: { authorization: `Bearer ${tokens.accessToken}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await harness.app.inject({
          method: "POST",
          url: "/api/auth/refresh",
          payload: { refreshToken: tokens.refreshToken },
        })
      ).statusCode,
    ).toBe(403);
  });

  it("allows a super admin already in an active organization without creating a role or membership", async () => {
    harness = await createTestApp();
    const token = await harness.auth.signAccessToken({
      userId: testIds.superNonMemberUser,
      sessionId: "session-super-non-member",
      organizationId: testIds.organization,
    });
    const headers = { authorization: `Bearer ${token}` };
    const user = await harness.app.inject({ method: "GET", url: "/api/user", headers });
    expect(user.statusCode).toBe(200);
    expect(user.json().data).toMatchObject({
      accessScope: "organization",
      organization: { id: testIds.organization, baseCurrency: "CNY", timezone: "Asia/Shanghai" },
      role: null,
    });
    expect(
      (await harness.app.inject({ method: "GET", url: "/api/roles/list", headers })).statusCode,
    ).toBe(200);
    expect(
      [...harness.state.members.values()].some((m) => m.userId === testIds.superNonMemberUser),
    ).toBe(false);
  });
});
