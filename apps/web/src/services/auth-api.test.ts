import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createAuthApi } from "./auth-api";

describe("createAuthApi", () => {
  function createHarness() {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => "access",
      fetchImpl: fetchMock,
    });

    return { api: createAuthApi(client), fetchMock };
  }

  it("posts login payload and refreshes the web session without a body", async () => {
    const { api, fetchMock } = createHarness();

    await api.login({
      email: "owner@example.com",
      password: "password",
      clientType: "web_pc",
    });
    await api.refresh();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "owner@example.com",
          password: "password",
          clientType: "web_pc",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/auth/refresh",
      expect.objectContaining({
        method: "POST",
        body: undefined,
      }),
    );
  });

  it("wraps current user, organization, and session endpoints", async () => {
    const { api, fetchMock } = createHarness();

    await api.getCurrentUser();
    await api.listOrganizations();
    await api.switchOrganization("org-1");
    await api.listSessions();
    await api.revokeSession("session-1");
    await api.revokeAllSessions();
    await api.logout();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/user",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/user/organizations",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:4000/user/current-organization",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ organizationId: "org-1" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "http://localhost:4000/auth/sessions/session-1/revoke",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "http://localhost:4000/auth/sessions/revoke-all",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "http://localhost:4000/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
