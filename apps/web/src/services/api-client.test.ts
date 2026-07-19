import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "./api-client";

describe("createApiClient", () => {
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
    expect(onAuthFailure).toHaveBeenCalledWith(expect.any(ApiError));
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
