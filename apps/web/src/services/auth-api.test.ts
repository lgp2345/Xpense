import type { CurrentUserResponse } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";

import { createAuthStore } from "../stores/auth-store";
import { type ApiClient, createApiClient } from "./api-client";
import { createAuthApi } from "./auth-api";

const currentUserContext: CurrentUserResponse = {
  user: { id: "user-1", email: "owner@example.com", isSuperAdmin: false, status: "active" },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members:read"],
  session: { id: "session-1", clientType: "web_pc" },
};

const errorEnvelope = (code: string, message: string) => ({ code, message, data: null });

describe("createAuthApi", () => {
  function createHarness() {
    const client = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    };

    return { api: createAuthApi(client as unknown as ApiClient), client };
  }

  it("posts login payload and refreshes the web session without a body", async () => {
    const { api, client } = createHarness();

    await api.login({
      email: "owner@example.com",
      password: "password",
      clientType: "web_pc",
    });
    await api.refresh();

    expect(client.post).toHaveBeenNthCalledWith(1, "/auth/login", {
      email: "owner@example.com",
      password: "password",
      clientType: "web_pc",
    });
    expect(client.post).toHaveBeenNthCalledWith(2, "/auth/refresh", undefined, {
      authFailure: "ignore",
      authRefresh: "ignore",
    });
  });

  it("wraps current user, organization, and session endpoints", async () => {
    const { api, client } = createHarness();

    await api.getCurrentUser();
    await api.listOrganizations();
    await api.switchOrganization("org-1");
    await api.listSessions();
    await api.revokeSession("session-1");
    await api.revokeAllSessions();
    await api.logout();

    expect(client.get).toHaveBeenNthCalledWith(1, "/user");
    expect(client.get).toHaveBeenNthCalledWith(2, "/user/organizations");
    expect(client.post).toHaveBeenNthCalledWith(
      1,
      "/user/current-organization",
      { organizationId: "org-1" },
      { authFailure: "ignore" },
    );
    expect(client.post).toHaveBeenNthCalledWith(2, "/auth/sessions/session-1/revoke");
    expect(client.post).toHaveBeenNthCalledWith(3, "/auth/sessions/revoke-all");
    expect(client.post).toHaveBeenNthCalledWith(4, "/auth/logout");
  });

  it("keeps the complete current state when the switch endpoint returns 401", async () => {
    const store = createAuthStore({ accessToken: "old-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock
      .onPost(/\/user\/current-organization$/)
      .reply(401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期"));
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => store.getState().accessToken,
      instance,
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
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/user$/).reply(401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期"));
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => store.getState().accessToken,
      instance,
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
    let resolveResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      resolveResponse = resolve;
    });
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock
      .onGet(/\/user$/)
      .reply(() =>
        responseGate.then(() => [401, errorEnvelope("UNAUTHENTICATED", "未登录或登录已过期")]),
      );
    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      getAccessToken: () => store.getState().accessToken,
      instance,
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
    resolveResponse?.();

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(store.getState()).toMatchObject({
      accessToken: "new-access",
      currentOrganization: newerContext.organization,
      status: "authenticated",
    });
  });
});
