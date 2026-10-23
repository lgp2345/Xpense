import type { CurrentUserResponse } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it, vi } from "vitest";
import {
  changeOwnPassword,
  createWebSession,
  loginWebSession,
  logoutWebSession,
  returnWebSessionToPlatform,
} from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";

const context: CurrentUserResponse = {
  accessScope: "platform",
  user: {
    id: "account",
    phone: null,
    email: null,
    isSuperAdmin: true,
    status: "active",
    initialPasswordUnchanged: true,
  },
  organization: null,
  role: null,
  permissions: [],
  session: { id: "old-session", clientType: "web_pc" },
};
const input = {
  phone: "13800000001",
  password: "test-password",
  captchaId: "test-id",
  captchaText: "test-text",
};
const passwordInput = { currentPassword: "test-password", newPassword: "next-test-password" };
const replacement = {
  ...context,
  user: { ...context.user, initialPasswordUnchanged: false },
  session: { ...context.session, id: "replacement-session" },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function authenticatedStore() {
  const store = createAuthStore({ accessToken: "old-access" });
  store.getState().setCurrentUserContext(context);
  return store;
}
function response<T>(data: T) {
  return { code: "OK", message: "ok", data };
}
function httpSession() {
  const instance = axios.create();
  const mock = new MockAdapter(instance);
  const store = authenticatedStore();
  const session = createWebSession({ authStore: store, instance, baseUrl: "/api" });
  mock.onGet("/api/user").reply(200, response(replacement));
  return { mock, store, session };
}

describe("Cookie cleanup boundaries", () => {
  it("coalesces overlapping logouts before admitting a new login", async () => {
    const store = authenticatedStore();
    const pending = deferred<void>();
    let cookie: string | null = "old-cookie";
    const auth = {
      logout: vi
        .fn()
        .mockImplementationOnce(async () => {
          await pending.promise;
          cookie = null;
        })
        .mockImplementation(async () => {
          cookie = null;
        }),
      login: vi.fn(async () => {
        cookie = "new-cookie";
        return { accessToken: "new-access" };
      }),
      getCurrentUser: vi.fn(async () => context),
      refresh: vi.fn(),
    };
    const first = logoutWebSession(auth, store);
    const duplicate = logoutWebSession(auth, store);
    const login = loginWebSession(auth, store, input);
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(auth.login).not.toHaveBeenCalled();
    pending.resolve();
    await Promise.all([first, duplicate, login]);
    expect(cookie).toBe("new-cookie");
    expect(store.getState().accessToken).toBe("new-access");
  });
  it("waits for failed-login remote cleanup before the next login writes its Cookie", async () => {
    const store = createAuthStore();
    const cleanup = deferred<void>();
    const cleanupStarted = deferred<void>();
    let cookie: string | null = null;
    const auth = {
      logout: vi.fn(async () => {
        cleanupStarted.resolve();
        await cleanup.promise;
        cookie = null;
      }),
      login: vi.fn(async () => {
        cookie = "login-cookie";
        return { accessToken: "new-access" };
      }),
      getCurrentUser: vi
        .fn()
        .mockRejectedValueOnce(Error("identity offline"))
        .mockResolvedValue(context),
      refresh: vi.fn(),
    };
    const failed = loginWebSession(auth, store, input).catch(() => false);
    await cleanupStarted.promise;
    const next = loginWebSession(auth, store, input);
    expect(auth.login).toHaveBeenCalledTimes(1);
    cleanup.resolve();
    await Promise.all([failed, next]);
    expect(cookie).toBe("login-cookie");
    expect(store.getState().status).toBe("authenticated");
  });
});

describe("password and automatic refresh ordering", () => {
  it("adopts the replacement session after password's own 401 refresh and replay", async () => {
    const { mock, store, session } = httpSession();
    mock.onPost("/api/auth/password/update").replyOnce(401, { message: "expired" });
    mock.onPost("/api/auth/refresh").reply(200, response({ accessToken: "refreshed-old-access" }));
    mock
      .onPost("/api/auth/password/update")
      .reply(200, response({ accessToken: "replacement-access" }));
    await changeOwnPassword(session, passwordInput);
    expect(store.getState()).toMatchObject({
      accessToken: "replacement-access",
      session: { id: "replacement-session" },
      currentUser: { initialPasswordUnchanged: false },
    });
    expect(mock.history.get.filter((request) => request.url === "/api/user")).toHaveLength(1);
  });
  it("delivers an already pending refresh Cookie before sending password replacement", async () => {
    const { mock, store, session } = httpSession();
    const refresh = deferred<[number, unknown]>();
    const refreshStarted = deferred<void>();
    let cookie = "old-cookie";
    mock.onGet("/api/auth/sessions").replyOnce(401, { message: "expired" });
    mock.onGet("/api/auth/sessions").reply(200, response([]));
    mock.onPost("/api/auth/refresh").reply(async () => {
      refreshStarted.resolve();
      const value = await refresh.promise;
      cookie = "rotated-old-cookie";
      return value;
    });
    mock.onPost("/api/auth/password/update").reply(() => {
      cookie = "replacement-cookie";
      return [200, response({ accessToken: "replacement-access" })];
    });
    const background = session.authApi.listSessions().catch(() => []);
    await refreshStarted.promise;
    const password = changeOwnPassword(session, passwordInput);
    refresh.resolve([200, response({ accessToken: "refreshed-old-access" })]);
    await Promise.all([password, background]);
    expect(cookie).toBe("replacement-cookie");
    expect(store.getState().session?.id).toBe("replacement-session");
  });
  it("does not start an unrelated old-session refresh while password's response is pending", async () => {
    const { mock, store, session } = httpSession();
    const passwordResponse = deferred<[number, unknown]>();
    const passwordStarted = deferred<void>();
    let cookie = "old-cookie";
    mock.onPost("/api/auth/password/update").reply(async () => {
      passwordStarted.resolve();
      const value = await passwordResponse.promise;
      cookie = "replacement-cookie";
      return value;
    });
    mock.onGet("/api/auth/sessions").reply(401, { message: "expired" });
    mock.onPost("/api/auth/refresh").reply(() => {
      cookie = "rotated-old-cookie";
      return [200, response({ accessToken: "refreshed-old-access" })];
    });
    const password = changeOwnPassword(session, passwordInput);
    await passwordStarted.promise;
    const background = session.authApi.listSessions().catch(() => []);
    // Flush the immediate Axios rejection/refresh chain, without a wall-clock race.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(mock.history.post.filter((request) => request.url === "/api/auth/refresh")).toHaveLength(
      0,
    );
    passwordResponse.resolve([200, response({ accessToken: "replacement-access" })]);
    await Promise.all([password, background]);
    expect(cookie).toBe("replacement-cookie");
    expect(store.getState().session?.id).toBe("replacement-session");
  });
  it("keeps password's own refresh available after blocking an unrelated expired request", async () => {
    const { mock, store, session } = httpSession();
    const passwordResponse = deferred<[number, unknown]>();
    const started = deferred<void>();
    mock.onPost("/api/auth/password/update").replyOnce(() => {
      started.resolve();
      return passwordResponse.promise;
    });
    mock
      .onPost("/api/auth/password/update")
      .reply(200, response({ accessToken: "replacement-access" }));
    mock.onGet("/api/auth/sessions").reply(401, { message: "expired" });
    mock.onPost("/api/auth/refresh").reply(200, response({ accessToken: "refreshed-old-access" }));
    const password = changeOwnPassword(session, passwordInput);
    await started.promise;
    await expect(session.authApi.listSessions()).rejects.toThrow();
    expect(store.getState().status).toBe("authenticated");
    expect(mock.history.post.filter((request) => request.url === "/api/auth/refresh")).toHaveLength(
      0,
    );
    passwordResponse.resolve([401, { message: "expired" }]);
    await password;
    expect(store.getState().session?.id).toBe("replacement-session");
  });
  it("adopts platform context when return-to-platform needs its own refresh", async () => {
    const { mock, store, session } = httpSession();
    mock.onPost("/api/auth/platform").replyOnce(401, { message: "expired" });
    mock.onPost("/api/auth/platform").reply(200, response({ accessToken: "platform-access" }));
    mock.onPost("/api/auth/refresh").reply(200, response({ accessToken: "refreshed-old-access" }));
    await returnWebSessionToPlatform(session);
    expect(store.getState()).toMatchObject({
      accessToken: "platform-access",
      accessScope: "platform",
    });
    expect(mock.history.get.filter((request) => request.url === "/api/user")).toHaveLength(1);
  });
});
