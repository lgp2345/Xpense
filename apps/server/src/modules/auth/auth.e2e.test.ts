import { afterEach, describe, expect, it } from "vitest";
import { login, parseJson, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";

describe("Auth e2e", () => {
  let harness: TestAppHarness | null = null;

  afterEach(async () => {
    await harness?.app.close();
    harness = null;
  });

  async function createHarness(): Promise<TestAppHarness> {
    harness = await createTestApp();
    return harness;
  }

  it("POST /auth/login returns accessToken and refreshToken", async () => {
    const { app } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType: "web_pc",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(parseJson(response)).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
  });

  it("POST /auth/refresh rotates refreshToken and rejects the old token", async () => {
    const { app } = await createHarness();
    const tokens = await login(app, "owner@example.com");

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: {
        refreshToken: tokens.refreshToken,
      },
    });

    expect(refreshResponse.statusCode).toBe(201);
    const refreshed = parseJson(refreshResponse);
    expect(refreshed.accessToken).toEqual(expect.any(String));
    expect(refreshed.refreshToken).toEqual(expect.any(String));
    expect(refreshed.refreshToken).not.toBe(tokens.refreshToken);

    const oldTokenResponse = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: {
        refreshToken: tokens.refreshToken,
      },
    });

    expect(oldTokenResponse.statusCode).toBe(401);
  });

  it("GET /user returns current organization and permissions", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/user",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(parseJson(response)).toMatchObject({
      user: {
        id: testIds.managerUser,
        email: "manager@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      organization: {
        id: testIds.organization,
        name: "Acme",
      },
      role: {
        id: testIds.managerRole,
        key: "manager",
        name: "Manager",
      },
      permissions: expect.arrayContaining(["roles.read", "members.update"]),
      session: {
        clientType: "web_pc",
      },
    });
  });
});
