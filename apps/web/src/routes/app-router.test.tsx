import { createMemoryHistory } from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserResponse } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../components/app-providers";
import { createWebSession } from "../services/web-session";
import { authStore, createAuthStore } from "../stores/auth-store";
import { AppRouter, createAppRouter } from "./router";

const injectedUserContext: CurrentUserResponse = {
  user: {
    id: "injected-user",
    email: "injected@example.com",
    isSuperAdmin: false,
    status: "active",
  },
  organization: { id: "org-injected", name: "注入账本" },
  role: { id: "role-injected", key: "owner", name: "所有者" },
  permissions: [],
  session: { id: "session-injected", clientType: "web_pc" },
};

const globalUserContext: CurrentUserResponse = {
  ...injectedUserContext,
  user: { ...injectedUserContext.user, id: "global-user", email: "global@example.com" },
  organization: { id: "org-global", name: "全局账本" },
};

function createTestSession(store: ReturnType<typeof createAuthStore>) {
  const instance = axios.create();
  const mock = new MockAdapter(instance);
  mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });

  return createWebSession({
    authStore: store,
    baseUrl: "http://localhost:4000",
    instance,
  });
}

describe("AppRouter startup", () => {
  it("waits for cookie session restoration before rendering protected content", async () => {
    const store = createAuthStore();
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      session: createTestSession(store),
    });
    let finishRestore: (() => void) | undefined;
    const restoreSession = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishRestore = () => {
            store.getState().setAccessToken("access-token");
            store.getState().setCurrentUserContext({
              user: {
                id: "user-1",
                email: "owner@example.com",
                isSuperAdmin: false,
                status: "active",
              },
              organization: { id: "org-1", name: "个人账本" },
              role: { id: "role-1", key: "owner", name: "所有者" },
              permissions: [],
              session: { id: "session-1", clientType: "web_pc" },
            });
            resolve(true);
          };
        }),
    );

    render(
      <AppProviders>
        <AppRouter restoreSession={restoreSession} router={router} />
      </AppProviders>,
    );

    expect(screen.getByText("正在恢复会话...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "仪表盘" })).not.toBeInTheDocument();

    await act(async () => finishRestore?.());

    expect(await screen.findByRole("heading", { name: "仪表盘" })).toBeInTheDocument();
  });

  it("restores the cookie session only once in React StrictMode", () => {
    const restoreSession = vi.fn(() => new Promise<boolean>(() => undefined));
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      session: createTestSession(createAuthStore()),
    });

    render(
      <AppProviders>
        <StrictMode>
          <AppRouter restoreSession={restoreSession} router={router} />
        </StrictMode>
      </AppProviders>,
    );

    expect(restoreSession).toHaveBeenCalledTimes(1);
  });

  it("invalidates an already-rendered protected route when authentication is cleared", async () => {
    const store = createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "owner", name: "所有者" },
      permissions: ["members:read"],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/members"] }),
      session: createTestSession(store),
    });

    render(
      <AppProviders>
        <AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />
      </AppProviders>,
    );
    expect(await screen.findByRole("heading", { name: "成员管理" })).toBeInTheDocument();

    act(() => store.getState().clearAuth());

    expect(await screen.findByRole("heading", { name: "登录到你的账本" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ redirect: "/members" });
  });

  it("uses one injected session for the dashboard header, organizations, logout, and guard", async () => {
    const user = userEvent.setup();
    const store = createAuthStore({ accessToken: "injected-access" });
    store.getState().setCurrentUserContext(injectedUserContext);
    authStore.getState().setAccessToken("global-access");
    authStore.getState().setCurrentUserContext(globalUserContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/user\/organizations$/).reply(200, {
      code: "OK",
      message: "ok",
      data: [
        { id: "org-injected", name: "注入账本", status: "active" },
        { id: "org-family", name: "家庭账本", status: "active" },
      ],
    });
    mock.onPost(/\/auth\/logout$/).reply(200, { code: "OK", message: "ok", data: null });
    mock.onAny().reply(500, { code: "INTERNAL_ERROR", message: "unexpected request", data: null });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const router = createAppRouter({
      session,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    try {
      render(
        <AppProviders>
          <AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />
        </AppProviders>,
      );

      expect((await screen.findAllByText("injected@example.com")).length).toBeGreaterThan(0);
      expect(screen.queryByText("global@example.com")).not.toBeInTheDocument();
      await vi.waitFor(() =>
        expect(mock.history.get.some((config) => config.url?.endsWith("/user/organizations"))).toBe(
          true,
        ),
      );

      await user.click(screen.getByRole("button", { name: /injected@example.com/ }));
      await user.click(screen.getByRole("menuitem", { name: "退出登录" }));

      expect(await screen.findByRole("heading", { name: "登录到你的账本" })).toBeInTheDocument();
      expect(store.getState()).toMatchObject({ accessToken: null, status: "anonymous" });
      expect(authStore.getState()).toMatchObject({
        accessToken: "global-access",
        currentUser: globalUserContext.user,
        status: "authenticated",
      });
      expect(
        mock.history.post.map((config) => ({
          url: config.url,
          authorization:
            typeof config.headers?.get === "function"
              ? config.headers.get("Authorization")
              : (config.headers as Record<string, unknown> | undefined)?.Authorization,
        })),
      ).toEqual([
        {
          url: "http://localhost:4000/auth/logout",
          authorization: "Bearer injected-access",
        },
      ]);
    } finally {
      authStore.getState().clearAuth();
    }
  });

  it("uses the active router session for default restoration", async () => {
    const store = createAuthStore();
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onPost(/\/auth\/refresh$/).reply(200, {
      code: "OK",
      message: "ok",
      data: { accessToken: "restored-injected-access" },
    });
    mock.onGet(/\/user$/).reply(200, { code: "OK", message: "ok", data: injectedUserContext });
    mock.onGet(/\/user\/organizations$/).reply(200, {
      code: "OK",
      message: "ok",
      data: [{ id: "org-injected", name: "注入账本", status: "active" }],
    });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const router = createAppRouter({
      session,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(
      <AppProviders>
        <AppRouter router={router} />
      </AppProviders>,
    );

    expect((await screen.findAllByText("injected@example.com")).length).toBeGreaterThan(0);
    expect(store.getState()).toMatchObject({
      accessToken: "restored-injected-access",
      currentUser: injectedUserContext.user,
      status: "authenticated",
    });
    expect(mock.history.post.some((config) => config.url?.endsWith("/auth/refresh"))).toBe(true);
  });
});
