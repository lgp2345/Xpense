import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "./api-client";

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
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;

      if (authorization === "Bearer expired-access") {
        return new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ authorization }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => activeToken,
      fetchImpl: fetchMock as typeof fetch,
      refreshAccessToken,
    } as Parameters<typeof createApiClient>[0]);

    const firstRequest = client.get("/members").then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ error, status: "rejected" as const }),
    );
    const secondRequest = client.get("/roles").then(
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
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("replays an unauthorized request at most once before reporting auth failure", async () => {
    let activeToken = "expired-access";
    const onAuthFailure = vi.fn();
    const refreshAccessToken = vi.fn(async () => {
      activeToken = "refreshed-access";
      return activeToken;
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => activeToken,
      fetchImpl: fetchMock,
      onAuthFailure,
      refreshAccessToken,
    } as Parameters<typeof createApiClient>[0]);

    await expect(client.get("/user")).rejects.toMatchObject({ status: 401 });

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledWith(expect.any(ApiError), "refreshed-access");
  });

  it("does not refresh after the request token has been cleared", async () => {
    let activeToken: string | null = "expired-access";
    let resolveResponse: (response: Response) => void = () => undefined;
    const responseGate = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const refreshAccessToken = vi.fn().mockResolvedValue(null);
    const fetchMock = vi.fn().mockReturnValue(responseGate);
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => activeToken,
      fetchImpl: fetchMock,
      refreshAccessToken,
    } as Parameters<typeof createApiClient>[0]);

    const request = client.get("/members");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    activeToken = null;
    resolveResponse(
      new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not replay a request after an unrelated access token change", async () => {
    let activeToken = "organization-a-access";
    let resolveResponse: (response: Response) => void = () => undefined;
    const responseGate = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const refreshAccessToken = vi.fn();
    const fetchMock = vi.fn().mockReturnValue(responseGate);
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => activeToken,
      fetchImpl: fetchMock,
      refreshAccessToken,
    } as Parameters<typeof createApiClient>[0]);

    const request = client.patch("/members/member-1", { status: "disabled" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    activeToken = "organization-b-access";
    resolveResponse(
      new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports missing API configuration when a request is attempted", async () => {
    const client = createApiClient({
      baseUrl: undefined as never,
      getAccessToken: () => null,
    });

    await expect(client.get("/health")).rejects.toThrow(/VITE_API_PREFIX/);
  });

  it("adds bearer token and parses json response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => "token",
      fetchImpl: fetchMock,
    });

    await expect(client.get("/user")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/user",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });

  it("serializes request bodies as json", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: "access" }),
    });
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => null,
      fetchImpl: fetchMock,
    });

    await client.post("/auth/login", { email: "a@example.com" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: "a@example.com" }),
      }),
    );
  });

  it("omits the JSON content type when a request has no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: "access" }),
    });
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => null,
      fetchImpl: fetchMock,
    });

    await client.post("/auth/refresh");

    const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(requestOptions.body).toBeUndefined();
    expect(requestOptions.headers).not.toHaveProperty("Content-Type");
  });

  it("maps 403 responses to ApiError without clearing authentication", async () => {
    const onAuthFailure = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ code: "FORBIDDEN", message: "Missing permission" }),
    });
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => "token",
      fetchImpl: fetchMock,
      onAuthFailure,
    });

    await expect(client.get("/roles")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "Missing permission",
    });
    await expect(client.get("/roles")).rejects.toBeInstanceOf(ApiError);
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it("invokes the auth failure hook for 401 responses", async () => {
    const onAuthFailure = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: "UNAUTHENTICATED", message: "Session expired" }),
    });
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => "token",
      fetchImpl: fetchMock,
      onAuthFailure,
    });

    await expect(client.get("/user")).rejects.toMatchObject({ status: 401 });
    expect(onAuthFailure).toHaveBeenCalledWith(expect.any(ApiError), "token");
  });

  it("does not invoke the auth failure hook when the request opts out", async () => {
    const onAuthFailure = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: "UNAUTHENTICATED", message: "Session expired" }),
    });
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => "token",
      fetchImpl: fetchMock,
      onAuthFailure,
    });

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
    let resolveResponse: ((response: Response) => void) | undefined;
    const onAuthFailure = vi.fn();
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => activeToken,
      fetchImpl: fetchMock,
      onAuthFailure,
    });

    const request = client.get("/user");
    activeToken = "new-access";
    resolveResponse?.(
      new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(onAuthFailure).toHaveBeenCalledWith(expect.any(ApiError), "old-access");
  });

  it("returns undefined for empty success responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error("empty");
      },
    });
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => null,
      fetchImpl: fetchMock,
    });

    await expect(client.delete("/roles/role-1")).resolves.toBeUndefined();
  });
});
