import type { AuthTokensResponse, CurrentUserResponse } from "@xpense/shared";
import axios, { type AxiosHeaders } from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";

import { createAuthStore } from "../stores/auth-store";
import {
  createWebSession,
  loginWebSession,
  logoutWebSession,
  restoreWebSession,
  switchWebOrganization,
} from "./web-session";

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
  permissions: ["members:read", "roles:read"],
  session: {
    id: "session-1",
    clientType: "web_pc",
  },
};

function createAuthApi(options: {
  loginResult?: AuthTokensResponse;
  refreshResult?: AuthTokensResponse;
  switchOrganizationResult?: AuthTokensResponse;
  userResult?: CurrentUserResponse;
}) {
  return {
    login: vi.fn().mockResolvedValue(options.loginResult ?? { accessToken: "login-access" }),
    refresh: vi.fn().mockResolvedValue(options.refreshResult ?? { accessToken: "refresh-access" }),
    switchOrganization: vi
      .fn()
      .mockResolvedValue(
        options.switchOrganizationResult ?? { accessToken: "organization-access" },
      ),
    getCurrentUser: vi.fn().mockResolvedValue(options.userResult ?? currentUserContext),
    listOrganizations: vi.fn().mockResolvedValue([]),
    logout: vi.fn().mockResolvedValue(undefined),
  };
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

function expectAnonymousState(store: ReturnType<typeof createAuthStore>) {
  expect(store.getState()).toMatchObject({
    accessToken: null,
    currentUser: null,
    currentOrganization: null,
    role: null,
    permissions: [],
    session: null,
    status: "anonymous",
  });
}

describe("web session", () => {
  it("refreshes concurrent protected 401 responses once and replays them with the new token", async () => {
    const store = createAuthStore({ accessToken: "expired-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock
      .onPost(/\/auth\/refresh$/)
      .reply(200, { code: "OK", message: "ok", data: { accessToken: "refreshed-access" } });
    mock.onGet(/\/user\/organizations$/).reply(200, { code: "OK", message: "ok", data: [] });
    mock.onGet(/\/user$/).reply((config) => {
      const headers = config.headers as AxiosHeaders | Record<string, unknown> | undefined;
      const authorization =
        typeof headers?.get === "function"
          ? headers.get("Authorization")
          : (headers as Record<string, unknown> | undefined)?.Authorization;

      if (authorization === "Bearer expired-access") {
        return [401, { code: "UNAUTHENTICATED", message: "未登录或登录已过期", data: null }];
      }

      return [200, { code: "OK", message: "ok", data: currentUserContext }];
    });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });

    await expect(
      Promise.all([session.authApi.getCurrentUser(), session.authApi.listOrganizations()]),
    ).resolves.toEqual([currentUserContext, []]);

    expect(
      mock.history.post.filter((config) => config.url?.endsWith("/auth/refresh")),
    ).toHaveLength(1);
    expect(store.getState()).toMatchObject({
      accessToken: "refreshed-access",
      status: "authenticated",
    });
  });

  it("keeps auth while refresh is pending and clears it only after refresh fails", async () => {
    const store = createAuthStore({ accessToken: "expired-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const refreshResponse = createDeferred<[number, unknown]>();
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onPost(/\/auth\/refresh$/).reply(() => refreshResponse.promise);
    mock
      .onGet(/\/user$/)
      .reply(401, { code: "UNAUTHENTICATED", message: "未登录或登录已过期", data: null });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });

    const requestOutcome = session.authApi.getCurrentUser().catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(mock.history.post.some((config) => config.url?.endsWith("/auth/refresh"))).toBe(true),
    );
    expect(store.getState()).toMatchObject({
      accessToken: "expired-access",
      status: "authenticated",
    });

    refreshResponse.resolve([
      401,
      { code: "UNAUTHENTICATED", message: "刷新会话无效", data: null },
    ]);

    await expect(requestOutcome).resolves.toMatchObject({ status: 401 });
    expectAnonymousState(store);
    expect(mock.history.get).toHaveLength(1);
    expect(mock.history.post).toHaveLength(1);
  });

  it("binds the full auth API and restoration workflow to the provided store", async () => {
    const store = createAuthStore();
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock
      .onPost(/\/auth\/refresh$/)
      .reply(200, { code: "OK", message: "ok", data: { accessToken: "restored-access" } });
    mock.onGet(/\/user$/).reply(200, { code: "OK", message: "ok", data: currentUserContext });

    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });

    expect(session.authStore).toBe(store);
    await expect(session.restoreSession()).resolves.toBe(true);
    expect(store.getState()).toMatchObject({
      accessToken: "restored-access",
      currentUser: currentUserContext.user,
      currentOrganization: currentUserContext.organization,
      status: "authenticated",
    });
  });

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

  it("replaces the access token and permission context after switching organizations", async () => {
    const store = createAuthStore({ accessToken: "org-1-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const switchedContext: CurrentUserResponse = {
      ...currentUserContext,
      organization: { id: "org-2", name: "家庭账本" },
      role: { id: "role-2", key: "member", name: "成员" },
      permissions: ["transactions:read"],
      session: { id: "session-1", clientType: "web_mobile" },
    };
    const api = createAuthApi({
      switchOrganizationResult: { accessToken: "org-2-access" },
      userResult: switchedContext,
    });
    api.getCurrentUser.mockImplementation(async () => {
      expect(store.getState().accessToken).toBe("org-2-access");

      return switchedContext;
    });

    await switchWebOrganization(api, store, "org-2");

    expect(api.switchOrganization).toHaveBeenCalledWith("org-2");
    expect(store.getState()).toMatchObject({
      accessToken: "org-2-access",
      currentOrganization: switchedContext.organization,
      role: switchedContext.role,
      permissions: ["transactions:read"],
      session: switchedContext.session,
    });
  });

  it("keeps the prior token and complete context when the organization switch request fails", async () => {
    const store = createAuthStore({ accessToken: "org-1-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const api = createAuthApi({});
    api.switchOrganization.mockRejectedValue(new Error("request failed"));

    await expect(switchWebOrganization(api, store, "org-2")).rejects.toThrow(
      "Unable to switch organization",
    );

    expect(store.getState()).toMatchObject({
      accessToken: "org-1-access",
      currentUser: currentUserContext.user,
      currentOrganization: currentUserContext.organization,
      role: currentUserContext.role,
      permissions: currentUserContext.permissions,
      session: currentUserContext.session,
      status: "authenticated",
    });
    expect(api.getCurrentUser).not.toHaveBeenCalled();
  });

  it("clears complete local authentication when current-user loading fails after a successful switch", async () => {
    const store = createAuthStore({ accessToken: "org-1-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const api = createAuthApi({ switchOrganizationResult: { accessToken: "org-2-access" } });
    api.getCurrentUser.mockRejectedValue(new Error("request failed"));

    await expect(switchWebOrganization(api, store, "org-2")).rejects.toThrow(
      "Unable to switch organization",
    );

    expectAnonymousState(store);
  });

  it("sends only one request when two organization switches overlap for the same store", async () => {
    const store = createAuthStore({ accessToken: "org-1-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const switchRequest = createDeferred<AuthTokensResponse>();
    const api = createAuthApi({ userResult: currentUserContext });
    api.switchOrganization.mockReturnValue(switchRequest.promise);

    const firstSwitch = switchWebOrganization(api, store, "org-2");
    const secondSwitch = switchWebOrganization(api, store, "org-3");

    expect(api.switchOrganization).toHaveBeenCalledTimes(1);
    switchRequest.resolve({ accessToken: "org-2-access" });
    await Promise.all([firstSwitch, secondSwitch]);
    expect(api.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("starts remote logout with the current token and clears complete local auth immediately", async () => {
    const store = createAuthStore({ accessToken: "org-1-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const logoutRequest = createDeferred<void>();
    const api = createAuthApi({});
    api.logout.mockImplementation(() => {
      expect(store.getState().accessToken).toBe("org-1-access");

      return logoutRequest.promise;
    });

    const logout = logoutWebSession(api, store);

    expect(api.logout).toHaveBeenCalledOnce();
    expectAnonymousState(store);
    logoutRequest.resolve();
    await logout;
  });

  it("invalidates a pending switch when logout starts so its result cannot restore auth", async () => {
    const store = createAuthStore({ accessToken: "org-1-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const switchRequest = createDeferred<AuthTokensResponse>();
    const logoutRequest = createDeferred<void>();
    const api = createAuthApi({});
    api.switchOrganization.mockReturnValue(switchRequest.promise);
    api.logout.mockReturnValue(logoutRequest.promise);

    const switching = switchWebOrganization(api, store, "org-2");
    const loggingOut = logoutWebSession(api, store);

    expectAnonymousState(store);
    switchRequest.resolve({ accessToken: "org-2-access" });
    await switching;
    expect(api.getCurrentUser).not.toHaveBeenCalled();
    expectAnonymousState(store);
    logoutRequest.resolve();
    await loggingOut;
  });

  it("ignores a rejected stale switch after logout and a new login", async () => {
    const store = createAuthStore({ accessToken: "org-1-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const switchRequest = createDeferred<AuthTokensResponse>();
    const api = createAuthApi({});
    api.switchOrganization.mockReturnValue(switchRequest.promise);

    const switching = switchWebOrganization(api, store, "org-2");
    await logoutWebSession(api, store);

    const newLoginContext: CurrentUserResponse = {
      ...currentUserContext,
      user: { ...currentUserContext.user, email: "new-login@example.com" },
      organization: { id: "org-3", name: "新登录账本" },
    };
    store.getState().setAccessToken("new-login-access");
    store.getState().setCurrentUserContext(newLoginContext);
    switchRequest.reject(new Error("stale switch failed"));

    await expect(switching).resolves.toBeUndefined();
    expect(store.getState()).toMatchObject({
      accessToken: "new-login-access",
      currentUser: newLoginContext.user,
      currentOrganization: newLoginContext.organization,
      status: "authenticated",
    });
  });

  it("does not let an old current-user response overwrite a new login after logout", async () => {
    const store = createAuthStore({ accessToken: "org-1-access" });
    store.getState().setCurrentUserContext(currentUserContext);
    const oldCurrentUserRequest = createDeferred<CurrentUserResponse>();
    const api = createAuthApi({ switchOrganizationResult: { accessToken: "org-2-access" } });
    api.getCurrentUser.mockReturnValue(oldCurrentUserRequest.promise);

    const switching = switchWebOrganization(api, store, "org-2");
    await vi.waitFor(() => expect(api.getCurrentUser).toHaveBeenCalledOnce());
    await logoutWebSession(api, store);

    const newLoginContext: CurrentUserResponse = {
      ...currentUserContext,
      user: { ...currentUserContext.user, email: "new-login@example.com" },
      organization: { id: "org-3", name: "新登录账本" },
    };
    store.getState().setAccessToken("new-login-access");
    store.getState().setCurrentUserContext(newLoginContext);
    oldCurrentUserRequest.resolve({
      ...currentUserContext,
      organization: { id: "org-2", name: "旧切换账本" },
    });

    await switching;
    expect(store.getState()).toMatchObject({
      accessToken: "new-login-access",
      currentUser: newLoginContext.user,
      currentOrganization: newLoginContext.organization,
      status: "authenticated",
    });
  });
});
