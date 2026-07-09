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

  it("maps failed responses to ApiError and invokes auth failure hook", async () => {
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
