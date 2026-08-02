import { afterEach, describe, expect, it } from "vitest";
import { login, parseJson, testIds } from "../../test/auth-test-helpers.js";
import { createTestApp, type TestAppHarness } from "../../test/create-test-app.js";

const refreshCookieName = "xpense_refresh_token";

type InjectResponse = {
  headers: Record<string, number | string | string[] | undefined>;
};

function requireSetCookie(response: InjectResponse): string {
  const value = response.headers["set-cookie"];
  const setCookie = Array.isArray(value) ? value[0] : String(value ?? "");

  if (!setCookie) {
    throw new Error("Set-Cookie header is required");
  }

  return setCookie;
}

function toCookieHeader(setCookie: string): string {
  const [cookie] = setCookie.split(";", 1);

  if (!cookie) {
    throw new Error("Cookie value is required");
  }

  return cookie;
}

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

  it("POST /api/auth/login stores web refresh token in an HTTP-only cookie", async () => {
    const { app } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType: "web_pc",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(parseJson(response)).toEqual({
      accessToken: expect.any(String),
    });
    const setCookie = requireSetCookie(response);
    expect(setCookie).toContain(`${refreshCookieName}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/api/auth");
    expect(setCookie).toContain("Max-Age=2592000");
    expect(setCookie).not.toContain("Secure");
  });

  it("uses a configured API prefix for auth routes and refresh-cookie path", async () => {
    const previousApiPrefix = process.env.VITE_API_PREFIX;
    process.env.VITE_API_PREFIX = "v2";

    try {
      const { app } = await createHarness();
      const loginResponse = await app.inject({
        method: "POST",
        url: "/v2/auth/login",
        payload: {
          email: "owner@example.com",
          password: "password",
          clientType: "web_pc",
        },
      });

      expect(loginResponse.statusCode).toBe(201);
      expect(requireSetCookie(loginResponse)).toContain("Path=/v2/auth");

      const defaultPrefixResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "owner@example.com",
          password: "password",
          clientType: "web_pc",
        },
      });

      expect(defaultPrefixResponse.statusCode).toBe(404);
    } finally {
      if (previousApiPrefix === undefined) {
        delete process.env.VITE_API_PREFIX;
      } else {
        process.env.VITE_API_PREFIX = previousApiPrefix;
      }
    }
  });

  it("POST /api/auth/refresh reads and rotates the web refresh cookie without a body", async () => {
    const { app } = await createHarness();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType: "web_pc",
      },
    });
    const loginCookie = toCookieHeader(requireSetCookie(loginResponse));

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        cookie: loginCookie,
      },
    });

    expect(refreshResponse.statusCode).toBe(201);
    expect(parseJson(refreshResponse)).toEqual({ accessToken: expect.any(String) });
    const rotatedCookie = toCookieHeader(requireSetCookie(refreshResponse));
    expect(rotatedCookie).not.toBe(loginCookie);

    const oldTokenResponse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: {
        cookie: loginCookie,
      },
    });

    expect(oldTokenResponse.statusCode).toBe(401);
  });

  it("rejects a Web refresh token sent in JSON without rotating it", async () => {
    const { app } = await createHarness();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType: "web_pc",
      },
    });
    const loginCookie = toCookieHeader(requireSetCookie(loginResponse));
    const refreshToken = loginCookie.slice(`${refreshCookieName}=`.length);

    const wrongTransportResponse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken },
    });
    expect(wrongTransportResponse.statusCode).toBe(401);

    const cookieRefreshResponse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: loginCookie },
    });
    expect(cookieRefreshResponse.statusCode).toBe(201);
  });

  it("rejects an App refresh token sent as a Cookie without rotating it", async () => {
    const { app } = await createHarness();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType: "app_ios",
      },
    });
    const tokens = parseJson<{ accessToken: string; refreshToken: string }>(loginResponse);

    const wrongTransportResponse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: `${refreshCookieName}=${tokens.refreshToken}` },
    });
    expect(wrongTransportResponse.statusCode).toBe(401);

    const bodyRefreshResponse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(bodyRefreshResponse.statusCode).toBe(201);
  });

  it("allows only one concurrent Web refresh with the same Cookie", async () => {
    const { app } = await createHarness();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType: "web_pc",
      },
    });
    const loginCookie = toCookieHeader(requireSetCookie(loginResponse));

    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/api/auth/refresh", headers: { cookie: loginCookie } }),
      app.inject({ method: "POST", url: "/api/auth/refresh", headers: { cookie: loginCookie } }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 401]);
  });

  it.each([
    "app_ios",
    "app_android",
  ] as const)("keeps %s login and refresh tokens in JSON", async (clientType) => {
    const { app } = await createHarness();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType,
      },
    });

    expect(loginResponse.statusCode).toBe(201);
    expect(loginResponse.headers["set-cookie"]).toBeUndefined();
    const tokens = parseJson<{ accessToken: string; refreshToken: string }>(loginResponse);
    expect(tokens).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: tokens.refreshToken },
    });

    expect(refreshResponse.statusCode).toBe(201);
    expect(refreshResponse.headers["set-cookie"]).toBeUndefined();
    expect(parseJson(refreshResponse)).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.not.stringContaining(tokens.refreshToken),
    });
  });

  it("uses the web refresh cookie for web_mobile login", async () => {
    const { app } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType: "web_mobile",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(parseJson(response)).toEqual({ accessToken: expect.any(String) });
    expect(requireSetCookie(response)).toContain(`${refreshCookieName}=`);
  });

  it("marks the web refresh cookie secure for an HTTPS web origin", async () => {
    const previousWebOrigin = process.env.WEB_ORIGIN;
    process.env.WEB_ORIGIN = "https://xpense.example";

    try {
      const { app } = await createHarness();
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "owner@example.com",
          password: "password",
          clientType: "web_pc",
        },
      });

      expect(requireSetCookie(response)).toContain("Secure");
    } finally {
      if (previousWebOrigin === undefined) {
        delete process.env.WEB_ORIGIN;
      } else {
        process.env.WEB_ORIGIN = previousWebOrigin;
      }
    }
  });

  it("POST /api/auth/logout clears the web refresh cookie with the matching path", async () => {
    const { app } = await createHarness();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType: "web_pc",
      },
    });
    const { accessToken } = parseJson<{ accessToken: string }>(loginResponse);
    const cookie = toCookieHeader(requireSetCookie(loginResponse));

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        authorization: `Bearer ${accessToken}`,
        cookie,
      },
    });

    expect(logoutResponse.statusCode).toBe(204);
    const clearedCookie = requireSetCookie(logoutResponse);
    expect(clearedCookie).toContain(`${refreshCookieName}=`);
    expect(clearedCookie).toContain("Path=/api/auth");
    expect(clearedCookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });

  it("clears and revokes a Web Cookie when the bearer token is invalid", async () => {
    const { app } = await createHarness();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType: "web_pc",
      },
    });
    const cookie = toCookieHeader(requireSetCookie(loginResponse));

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        authorization: "Bearer invalid-access-token",
        cookie,
      },
    });

    expect(logoutResponse.statusCode).toBe(204);
    expect(requireSetCookie(logoutResponse)).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");

    const restoreResponse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie },
    });
    expect(restoreResponse.statusCode).toBe(401);
  });

  it("keeps valid App bearer logout semantics without a Cookie", async () => {
    const { app } = await createHarness();
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "owner@example.com",
        password: "password",
        clientType: "app_android",
      },
    });
    const tokens = parseJson<{ accessToken: string; refreshToken: string }>(loginResponse);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(logoutResponse.statusCode).toBe(204);

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(refreshResponse.statusCode).toBe(401);
  });

  it("returns an understandable unauthenticated error without exposing refresh tokens", async () => {
    const { app, state } = await createHarness();
    const invalidToken = "invalid-refresh-token-secret";

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: invalidToken },
    });

    expect(response.statusCode).toBe(401);
    expect(parseJson(response)).toMatchObject({
      code: "UNAUTHENTICATED",
      message: expect.any(String),
    });
    expect(response.payload).not.toContain(invalidToken);
    expect(JSON.stringify(state.auditLogs)).not.toContain(invalidToken);
  });

  it("returns an understandable unauthenticated error when no refresh token is provided", async () => {
    const { app } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
    });

    expect(response.statusCode).toBe(401);
    expect(parseJson(response)).toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Refresh session is required",
    });
  });

  it("enables credentialed CORS for the configured web origin", async () => {
    const { app } = await createHarness();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/auth/refresh",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not allow credentialed CORS for an unconfigured origin", async () => {
    const { app } = await createHarness();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/auth/refresh",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    });

    expect(response.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
  });

  it("GET /api/user returns current organization and permissions", async () => {
    const { app } = await createHarness();
    const { accessToken } = await login(app, "manager@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/user",
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
