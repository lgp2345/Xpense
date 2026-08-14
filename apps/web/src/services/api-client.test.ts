import axios, { type AxiosHeaders } from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "./api-client";

const okEnvelope = (data: unknown) => ({ code: "OK", message: "ok", data });
const errorEnvelope = (code: string, message: string) => ({ code, message, data: null });

function createHarness(
  options: {
    getAccessToken?: () => string | null;
    onAuthFailure?: (error: ApiError, requestAccessToken: string | null) => void;
    refreshAccessToken?: (requestAccessToken: string) => Promise<string | null>;
  } = {},
) {
  const instance = axios.create();
  const mock = new MockAdapter(instance);
  const client = createApiClient({
    baseUrl: "http://localhost:4000",
    getAccessToken: options.getAccessToken ?? (() => "token"),
    instance,
    onAuthFailure: options.onAuthFailure,
    refreshAccessToken: options.refreshAccessToken,
  });

  return { client, mock };
}

function headerOf(config: { headers?: unknown } | undefined, name: string): string | undefined {
  const headers = config?.headers as AxiosHeaders | Record<string, unknown> | undefined;

  if (!headers) {
    return undefined;
  }
  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  return headers[name] as string | undefined;
}

const authorizationOf = (config: { headers?: unknown } | undefined) =>
  headerOf(config, "Authorization");

describe("createApiClient", () => {
  it("shares one refresh across concurrent 401 responses and replays both requests", async () => {
    let activeToken = "expired-access";
    let releaseRefresh: () => void = () => undefined;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const refreshAccessToken = vi.fn(async () => {
      await refreshGate;
      activeToken = "refreshed-access";
      return activeToken;
    });
    const { client, mock } = createHarness({
      getAccessToken: () => activeToken,
      refreshAccessToken,
    });
    mock.onGet(/\/members\/list$|\/roles\/list$/).reply((config) => {
      if (authorizationOf(config) === "Bearer expired-access") {
        return [401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期")];
      }

      return [200, okEnvelope({ authorization: authorizationOf(config) })];
    });

    const firstRequest = client.get("/members/list").then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ error, status: "rejected" as const }),
    );
    const secondRequest = client.get("/roles/list").then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ error, status: "rejected" as const }),
    );
    await vi.waitFor(() => expect(refreshAccessToken).toHaveBeenCalledTimes(1));
    releaseRefresh();

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      {
        status: "fulfilled",
        value: { authorization: "Bearer refreshed-access" },
      },
      {
        status: "fulfilled",
        value: { authorization: "Bearer refreshed-access" },
      },
    ]);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mock.history.get).toHaveLength(4);
  });

  it("replays an unauthorized request at most once before reporting auth failure", async () => {
    let activeToken = "expired-access";
    const onAuthFailure = vi.fn();
    const refreshAccessToken = vi.fn(async () => {
      activeToken = "refreshed-access";
      return activeToken;
    });
    const { client, mock } = createHarness({
      getAccessToken: () => activeToken,
      onAuthFailure,
      refreshAccessToken,
    });
    mock.onGet(/\/user$/).reply(401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期"));

    await expect(client.get("/user")).rejects.toMatchObject({ status: 401 });

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mock.history.get).toHaveLength(2);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledWith(expect.any(ApiError), "refreshed-access");
  });

  it("does not refresh after the request token has been cleared", async () => {
    let activeToken: string | null = "expired-access";
    let resolveResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      resolveResponse = resolve;
    });
    const refreshAccessToken = vi.fn().mockResolvedValue(null);
    const { client, mock } = createHarness({
      getAccessToken: () => activeToken,
      refreshAccessToken,
    });
    mock
      .onGet(/\/members\/list$/)
      .reply(() =>
        responseGate.then(() => [401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期")]),
      );

    const request = client.get("/members/list");
    await vi.waitFor(() => expect(mock.history.get).toHaveLength(1));
    activeToken = null;
    resolveResponse?.();

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(mock.history.get).toHaveLength(1);
  });

  it("does not replay a request after an unrelated access token change", async () => {
    let activeToken = "organization-a-access";
    let resolveResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      resolveResponse = resolve;
    });
    const refreshAccessToken = vi.fn();
    const { client, mock } = createHarness({
      getAccessToken: () => activeToken,
      refreshAccessToken,
    });
    mock
      .onPost(/\/members\/update$/)
      .reply(() =>
        responseGate.then(() => [401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期")]),
      );

    const request = client.post("/members/update", { id: "member-1", status: "disabled" });
    await vi.waitFor(() => expect(mock.history.post).toHaveLength(1));
    activeToken = "organization-b-access";
    resolveResponse?.();

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(mock.history.post).toHaveLength(1);
  });

  it("reports missing API configuration when a request is attempted", async () => {
    const instance = axios.create();
    const client = createApiClient({
      baseUrl: undefined,
      getAccessToken: () => null,
      instance,
    });

    await expect(client.get("/health")).rejects.toThrow(/VITE_API_PREFIX/);
  });

  it("adds the bearer token and unwraps the success envelope", async () => {
    const { client, mock } = createHarness();
    mock.onGet(/\/user$/).reply(200, okEnvelope({ ok: true }));

    await expect(client.get("/user")).resolves.toEqual({ ok: true });
    expect(authorizationOf(mock.history.get[0])).toBe("Bearer token");
    expect(headerOf(mock.history.get[0], "X-Request-Id")).toBeDefined();
  });

  it("keeps the same request id across automatic retries", async () => {
    const { client, mock } = createHarness();
    mock.onGet(/\/flaky$/).reply(500, errorEnvelope("INTERNAL_ERROR", "服务器内部错误"));

    await expect(
      client.get("/flaky", { retry: { attempts: 1, baseDelayMs: 10 } }),
    ).rejects.toMatchObject({ status: 500 });

    const requestIds = mock.history.get.map((config) => headerOf(config, "X-Request-Id"));
    expect(requestIds).toHaveLength(2);
    expect(new Set(requestIds).size).toBe(1);
  });

  it("generates a distinct request id after an auth replay", async () => {
    let activeToken = "expired-access";
    const refreshAccessToken = vi.fn(async () => {
      activeToken = "refreshed-access";
      return activeToken;
    });
    const { client, mock } = createHarness({
      getAccessToken: () => activeToken,
      refreshAccessToken,
    });
    mock.onGet(/\/user$/).reply((config) => {
      if (authorizationOf(config) === "Bearer expired-access") {
        return [401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期")];
      }

      return [200, okEnvelope({ ok: true })];
    });

    await client.get("/user");

    const requestIds = mock.history.get.map((config) => headerOf(config, "X-Request-Id"));
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).toBeDefined();
    expect(requestIds[1]).toBeDefined();
    expect(requestIds[0]).not.toBe(requestIds[1]);
  });

  it("serializes request bodies as json", async () => {
    const { client, mock } = createHarness();
    mock.onPost(/\/auth\/login$/).reply(200, okEnvelope({ accessToken: "access" }));

    await client.post("/auth/login", { email: "a@example.com" });

    const config = mock.history.post[0];
    expect(config?.data).toBe(JSON.stringify({ email: "a@example.com" }));
    expect(headerOf(config, "Content-Type")).toContain("application/json");
  });

  it("does not send a JSON content type when a request has no body", async () => {
    const { client, mock } = createHarness();
    mock.onPost(/\/auth\/refresh$/).reply(200, okEnvelope({ accessToken: "access" }));

    await client.post("/auth/refresh");

    const config = mock.history.post[0];
    expect(config?.data).toBeUndefined();
    expect(headerOf(config, "Content-Type")).not.toContain("application/json");
  });

  it("maps 403 responses to ApiError without clearing authentication", async () => {
    const onAuthFailure = vi.fn();
    const { client, mock } = createHarness({ onAuthFailure });
    mock.onGet(/\/roles\/list$/).reply(403, errorEnvelope("FORBIDDEN", "缺少所需权限"));

    await expect(client.get("/roles/list")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "缺少所需权限",
    });
    await expect(client.get("/roles/list")).rejects.toBeInstanceOf(ApiError);
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it("invokes the auth failure hook for 401 responses", async () => {
    const onAuthFailure = vi.fn();
    const { client, mock } = createHarness({ onAuthFailure });
    mock.onGet(/\/user$/).reply(401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期"));

    await expect(client.get("/user")).rejects.toMatchObject({ status: 401 });
    expect(onAuthFailure).toHaveBeenCalledWith(expect.any(ApiError), "token");
  });

  it("does not invoke the auth failure hook when the request opts out", async () => {
    const onAuthFailure = vi.fn();
    const { client, mock } = createHarness({ onAuthFailure });
    mock
      .onPost(/\/user\/current-organization$/)
      .reply(401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期"));

    await expect(
      client.post(
        "/user/current-organization",
        { organizationId: "org-2" },
        { authFailure: "ignore" },
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it("reports the access token captured when a delayed request was sent", async () => {
    let activeToken = "old-access";
    let resolveResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      resolveResponse = resolve;
    });
    const onAuthFailure = vi.fn();
    const { client, mock } = createHarness({
      getAccessToken: () => activeToken,
      onAuthFailure,
    });
    mock
      .onGet(/\/user$/)
      .reply(() =>
        responseGate.then(() => [401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期")]),
      );

    const request = client.get("/user");
    activeToken = "new-access";
    resolveResponse?.();

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(onAuthFailure).toHaveBeenCalledWith(expect.any(ApiError), "old-access");
  });

  it("resolves null for success responses without data", async () => {
    const { client, mock } = createHarness();
    mock.onPost(/\/roles\/delete$/).reply(200, okEnvelope(null));

    await expect(client.post("/roles/delete", { id: "role-1" })).resolves.toBeNull();
  });

  it("rejects non-envelope success responses as protocol errors", async () => {
    const { client, mock } = createHarness();
    mock.onGet(/\/legacy$/).reply(200, { ok: true });

    await expect(client.get("/legacy")).rejects.toMatchObject({
      status: 200,
      code: "INTERNAL_ERROR",
      message: "服务端响应格式异常",
    });
  });

  it("retries GET network errors with the default policy", async () => {
    const { client, mock } = createHarness();
    mock.onGet(/\/flaky$/).networkError();

    await expect(client.get("/flaky")).rejects.toMatchObject({ status: 0 });
    expect(mock.history.get).toHaveLength(3);
  });

  it("retries GET 5xx responses", async () => {
    const { client, mock } = createHarness();
    mock.onGet(/\/flaky$/).reply(500, errorEnvelope("INTERNAL_ERROR", "服务器内部错误"));

    await expect(client.get("/flaky")).rejects.toMatchObject({ status: 500 });
    expect(mock.history.get).toHaveLength(3);
  });

  it("retries GET 429 responses", async () => {
    const { client, mock } = createHarness();
    mock.onGet(/\/flaky$/).reply(429, errorEnvelope("TOO_MANY_REQUESTS", "请求过于频繁"));

    await expect(client.get("/flaky")).rejects.toMatchObject({ status: 429 });
    expect(mock.history.get).toHaveLength(3);
  });

  it("does not retry POST by default", async () => {
    const { client, mock } = createHarness();
    mock.onPost(/\/members\/create$/).reply(500, errorEnvelope("INTERNAL_ERROR", "服务器内部错误"));

    await expect(
      client.post("/members/create", { userId: "user-1", roleId: "role-1" }),
    ).rejects.toMatchObject({
      status: 500,
    });
    expect(mock.history.post).toHaveLength(1);
  });

  it("retries POST only when explicitly enabled", async () => {
    const { client, mock } = createHarness();
    mock.onPost(/\/members\/create$/).reply(500, errorEnvelope("INTERNAL_ERROR", "服务器内部错误"));

    await expect(
      client.post(
        "/members/create",
        { userId: "user-1", roleId: "role-1" },
        { retry: { attempts: 2, baseDelayMs: 10 } },
      ),
    ).rejects.toMatchObject({ status: 500 });
    expect(mock.history.post).toHaveLength(3);
  });

  it("does not retry when a GET opts out", async () => {
    const { client, mock } = createHarness();
    mock.onGet(/\/flaky$/).reply(500, errorEnvelope("INTERNAL_ERROR", "服务器内部错误"));

    await expect(client.get("/flaky", { retry: false })).rejects.toMatchObject({ status: 500 });
    expect(mock.history.get).toHaveLength(1);
  });

  it("does not retry after the request is canceled during backoff", async () => {
    const controller = new AbortController();
    const { client, mock } = createHarness();
    mock.onGet(/\/flaky$/).reply(500, errorEnvelope("INTERNAL_ERROR", "服务器内部错误"));

    const request = client.get("/flaky", {
      signal: controller.signal,
      retry: { attempts: 3, baseDelayMs: 50_000 },
    });
    setTimeout(() => controller.abort(), 10);

    await expect(request).rejects.toMatchObject({ name: "CanceledError" });
    expect(mock.history.get).toHaveLength(1);
  });

  it("cancels the in-flight request with the same cancel key", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const { client, mock } = createHarness();
    mock
      .onGet(/\/search\/first$/)
      .reply(() => firstGate.then(() => [500, errorEnvelope("INTERNAL_ERROR", "服务器内部错误")]));
    mock.onGet(/\/search\/second$/).reply(200, okEnvelope({ result: "second" }));

    const firstRequest = client.get("/search/first", {
      cancelKey: "search",
      retry: { attempts: 2, baseDelayMs: 1_000 },
    });
    await vi.waitFor(() => expect(mock.history.get).toHaveLength(1));

    const secondRequest = client.get("/search/second", { cancelKey: "search" });
    releaseFirst?.();

    await expect(secondRequest).resolves.toEqual({ result: "second" });
    await expect(firstRequest).rejects.toMatchObject({ name: "CanceledError" });
    expect(mock.history.get).toHaveLength(2);
  });
});
