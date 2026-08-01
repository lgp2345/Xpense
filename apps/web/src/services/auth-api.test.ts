import type { CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { createAuthStore } from "../stores/auth-store";
import { createApiClient } from "./api-client";
import { createAuthApi } from "./auth-api";

const currentUserContext: CurrentUserResponse = {
  user: { id: "user-1", email: "owner@example.com", isSuperAdmin: false, status: "active" },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members.read"],
  session: { id: "session-1", clientType: "web_pc" },
};

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

  it("keeps the complete current state when the switch endpoint returns 401", async () => {
    const store = createAuthStore({ accessToken: "old-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => store.getState().accessToken,
      fetchImpl: fetchMock,
      onAuthFailure: (_error, requestAccessToken) => {
        if (store.getState().accessToken === requestAccessToken) {
          store.getState().clearAuth();
        }
      },
    });
    const api = createAuthApi(client);

    await expect(api.switchOrganization("org-2")).rejects.toMatchObject({ status: 401 });

    expect(store.getState()).toMatchObject({
      accessToken: "old-access",
      currentUser: currentUserContext.user,
      currentOrganization: currentUserContext.organization,
      role: currentUserContext.role,
      permissions: currentUserContext.permissions,
      session: currentUserContext.session,
      status: "authenticated",
    });
  });

  it("clears authentication for an ordinary protected 401 using the current token", async () => {
    const store = createAuthStore({ accessToken: "current-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => store.getState().accessToken,
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
      onAuthFailure: (_error, requestAccessToken) => {
        if (store.getState().accessToken === requestAccessToken) {
          store.getState().clearAuth();
        }
      },
    });

    await expect(createAuthApi(client).getCurrentUser()).rejects.toMatchObject({ status: 401 });
    expect(store.getState()).toMatchObject({ accessToken: null, status: "anonymous" });
  });

  it("does not clear a newer authenticated state for a delayed old-token 401", async () => {
    const store = createAuthStore({ accessToken: "old-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    let resolveResponse: ((response: Response) => void) | undefined;
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => store.getState().accessToken,
      fetchImpl: vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
      ),
      onAuthFailure: (_error, requestAccessToken) => {
        if (store.getState().accessToken === requestAccessToken) {
          store.getState().clearAuth();
        }
      },
    });
    const request = createAuthApi(client).getCurrentUser();
    const newerContext: CurrentUserResponse = {
      ...currentUserContext,
      organization: { id: "org-2", name: "家庭账本" },
    };

    store.getState().setAccessToken("new-access");
    store.getState().setCurrentUserContext(newerContext);
    resolveResponse?.(
      new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(store.getState()).toMatchObject({
      accessToken: "new-access",
      currentOrganization: newerContext.organization,
      status: "authenticated",
    });
  });
});
