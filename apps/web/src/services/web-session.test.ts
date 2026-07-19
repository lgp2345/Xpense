import type { AuthTokensResponse, CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { createAuthStore } from "../stores/auth-store";
import { loginWebSession, restoreWebSession } from "./web-session";

const currentUserContext: CurrentUserResponse = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    isSuperAdmin: false,
    status: "active",
  },
  organization: {
    id: "org-1",
    name: "个人账本",
  },
  role: {
    id: "role-1",
    key: "owner",
    name: "所有者",
  },
  permissions: ["members.read", "roles.read"],
  session: {
    id: "session-1",
    clientType: "web_pc",
  },
};

function createAuthApi(options: {
  loginResult?: AuthTokensResponse;
  refreshResult?: AuthTokensResponse;
  userResult?: CurrentUserResponse;
}) {
  return {
    login: vi.fn().mockResolvedValue(options.loginResult ?? { accessToken: "login-access" }),
    refresh: vi.fn().mockResolvedValue(options.refreshResult ?? { accessToken: "refresh-access" }),
    getCurrentUser: vi.fn().mockResolvedValue(options.userResult ?? currentUserContext),
    logout: vi.fn().mockResolvedValue(undefined),
  };
}

describe("web session", () => {
  it("restores the in-memory access token and current user from the refresh cookie", async () => {
    const store = createAuthStore();
    const api = createAuthApi({});

    await expect(restoreWebSession(api, store)).resolves.toBe(true);

    expect(api.refresh).toHaveBeenCalledWith();
    expect(api.getCurrentUser).toHaveBeenCalledWith();
    expect(store.getState()).toMatchObject({
      accessToken: "refresh-access",
      currentUser: currentUserContext.user,
      status: "authenticated",
    });
  });

  it("clears authentication when current-user loading fails after refresh", async () => {
    const store = createAuthStore();
    const api = createAuthApi({});
    api.getCurrentUser.mockRejectedValue(new Error("request failed"));

    await expect(restoreWebSession(api, store)).resolves.toBe(false);

    expect(store.getState()).toMatchObject({
      accessToken: null,
      currentUser: null,
      status: "anonymous",
    });
  });

  it("logs in as web_pc and leaves no partial session when current-user loading fails", async () => {
    const store = createAuthStore();
    const api = createAuthApi({});
    api.getCurrentUser.mockRejectedValue(new Error("request failed"));

    await expect(
      loginWebSession(api, store, {
        email: "owner@example.com",
        password: "password",
      }),
    ).rejects.toMatchObject({ kind: "service_unavailable" });

    expect(api.login).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "password",
      clientType: "web_pc",
    });
    expect(api.logout).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({ accessToken: null, status: "anonymous" });
  });
});
