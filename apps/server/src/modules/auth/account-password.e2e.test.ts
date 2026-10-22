import { afterEach, describe, expect, it } from "vitest";
import { TEST_CAPTCHA, TEST_PHONES, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";

describe("self-service password HTTP", () => {
  let h: TestAppHarness;
  afterEach(async () => {
    await h?.app.close();
  });
  async function setup(phone: string = TEST_PHONES.owner, clientType = "app_ios") {
    h = await createTestApp();
    const response = await h.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { ...TEST_CAPTCHA, phone, password: "password", clientType },
    });
    expect(response.statusCode).toBe(200);
    return response.json().data as { accessToken: string; refreshToken: string };
  }
  async function change(
    token: string,
    payload: Record<string, unknown> = {
      currentPassword: "password",
      newPassword: "changed-password",
    },
  ) {
    return h.app.inject({
      method: "POST",
      url: "/api/auth/password/update",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }
  it.each([
    TEST_PHONES.owner,
    TEST_PHONES.superNonMember,
  ])("updates own password and preserves scope for %s", async (phone) => {
    const old = await setup(phone);
    const result = await change(old.accessToken);
    expect(result.statusCode).toBe(200);
    const next = result.json().data;
    expect(next).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    const user = await h.app.inject({
      method: "GET",
      url: "/api/user",
      headers: { authorization: `Bearer ${next.accessToken}` },
    });
    expect(user.statusCode).toBe(200);
    expect(user.json().data.user.initialPasswordUnchanged).toBe(false);
    expect(user.json().data.accessScope).toBe(
      phone === TEST_PHONES.owner ? "organization" : "platform",
    );
    expect(
      (
        await h.app.inject({
          method: "GET",
          url: "/api/user",
          headers: { authorization: `Bearer ${old.accessToken}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await h.app.inject({
          method: "POST",
          url: "/api/auth/refresh",
          payload: { refreshToken: old.refreshToken },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await h.app.inject({
          method: "POST",
          url: "/api/auth/refresh",
          payload: { refreshToken: next.refreshToken },
        })
      ).statusCode,
    ).toBe(200);
    expect(JSON.stringify([result.json(), h.state.auditLogs])).not.toContain("changed-password");
  });
  it("sets a fresh HTTP-only cookie without returning the web refresh token", async () => {
    const old = await setup(TEST_PHONES.owner, "web_pc");
    const result = await change(old.accessToken);
    expect(result.statusCode).toBe(200);
    expect(result.json().data).toEqual({ accessToken: expect.any(String) });
    expect(String(result.headers["set-cookie"])).toContain("HttpOnly");
    expect(String(result.headers["set-cookie"])).toContain("Path=/api/auth");
  });
  it.each([
    { currentPassword: "wrong", newPassword: "changed-password" },
    { currentPassword: "password", newPassword: "password" },
    { currentPassword: "password", newPassword: "short" },
    { currentPassword: "password", newPassword: "changed-password", userId: testIds.superUser },
  ])("rejects invalid input or credentials without changing the account", async (payload) => {
    const old = await setup();
    const result = await change(old.accessToken, payload);
    expect(result.statusCode).toBe(400);
    expect(h.state.users.get(testIds.ownerUser)?.passwordHash).toBe("password:password");
    expect(h.state.users.get(testIds.ownerUser)?.initialPasswordUnchanged).not.toBe(false);
  });
  it("requires a live authenticated session", async () => {
    await setup();
    expect((await change("invalid-token")).statusCode).toBe(401);
  });
});
