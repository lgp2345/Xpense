import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthApi } from "../../services/auth-api";
import { createWebSession, type WebSessionDependency } from "../../services/web-session";
import { createAuthStore } from "../../stores/auth-store";
import { UserHeader } from "./user-header";

const currentUserContext: CurrentUserResponse = {
  user: {
    id: "user-1",
    email: "owner@example.com",
    isSuperAdmin: false,
    status: "active",
  },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members.read"],
  session: { id: "session-1", clientType: "web_pc" },
};

const switchedUserContext: CurrentUserResponse = {
  ...currentUserContext,
  organization: { id: "org-2", name: "家庭账本" },
  role: { id: "role-2", key: "member", name: "成员" },
  permissions: ["transactions.read"],
  session: { id: "session-1", clientType: "web_mobile" },
};

function createAuthSession(
  overrides: Partial<
    Pick<AuthApi, "getCurrentUser" | "listOrganizations" | "logout" | "switchOrganization">
  > = {},
  isAuthenticated = true,
) {
  const store = createAuthStore(isAuthenticated ? { accessToken: "org-1-access" } : {});

  if (isAuthenticated) {
    store.getState().setCurrentUserContext(currentUserContext);
  }

  const session = createWebSession({
    authStore: store,
    baseUrl: "http://localhost:4000",
    fetchImpl: (() => Promise.reject(new Error("Unexpected request"))) as typeof fetch,
  });
  const api = {
    getCurrentUser: vi.fn().mockResolvedValue(switchedUserContext),
    listOrganizations: vi.fn().mockResolvedValue([
      { id: "org-1", name: "个人账本", status: "active" },
      { id: "org-2", name: "家庭账本", status: "active" },
    ]),
    logout: vi.fn().mockResolvedValue(undefined),
    switchOrganization: vi.fn().mockResolvedValue({ accessToken: "org-2-access" }),
    ...overrides,
  };
  Object.assign(session.authApi, api);

  return { api, session, store };
}

function renderUserHeader(session: WebSessionDependency) {
  render(<UserHeader session={session} />);

  return session.authStore;
}

describe("UserHeader", () => {
  it("does not load organization options without a current organization", () => {
    const { api, session } = createAuthSession({}, false);

    render(<UserHeader session={session} />);

    expect(api.listOrganizations).not.toHaveBeenCalled();
  });

  it("shows the current context and refreshes it after selecting another organization", async () => {
    const user = userEvent.setup();
    const { api, session } = createAuthSession();
    const store = renderUserHeader(session);

    const switcher = await screen.findByRole("button", { name: /当前组织/ });
    await waitFor(() => expect(switcher).toBeEnabled());
    expect(screen.getByLabelText("当前用户与组织")).toHaveTextContent("个人账本");
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("角色：所有者")).toBeInTheDocument();
    expect(screen.getByText("会话客户端：网页端（web_pc）")).toBeInTheDocument();

    await user.click(switcher);
    await user.click(screen.getByRole("option", { name: "家庭账本" }));

    await waitFor(() => {
      expect(store.getState()).toMatchObject({
        accessToken: "org-2-access",
        currentOrganization: switchedUserContext.organization,
        role: switchedUserContext.role,
        permissions: switchedUserContext.permissions,
        session: switchedUserContext.session,
      });
    });
    expect(api.switchOrganization).toHaveBeenCalledWith("org-2");
    expect(api.getCurrentUser).toHaveBeenCalledOnce();
  });

  it("keeps the existing context and displays a safe message when switching fails", async () => {
    const user = userEvent.setup();
    const { session } = createAuthSession({
      switchOrganization: vi.fn().mockRejectedValue(new Error("access token=secret")),
    });
    const store = renderUserHeader(session);

    const switcher = await screen.findByRole("button", { name: /当前组织/ });
    await waitFor(() => expect(switcher).toBeEnabled());
    await user.click(switcher);
    await user.click(screen.getByRole("option", { name: "家庭账本" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("切换组织失败，请稍后重试。");
    expect(store.getState()).toMatchObject({
      accessToken: "org-1-access",
      currentOrganization: currentUserContext.organization,
      permissions: currentUserContext.permissions,
    });
  });

  it("clears the local session after a successful logout", async () => {
    const user = userEvent.setup();
    const { api, session } = createAuthSession();
    const store = renderUserHeader(session);

    await user.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(store.getState()).toMatchObject({ accessToken: null, status: "anonymous" });
    });
    expect(api.logout).toHaveBeenCalledOnce();
  });

  it("clears complete local authentication while remote logout stays pending", async () => {
    const user = userEvent.setup();
    const { api, session } = createAuthSession({
      logout: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const store = renderUserHeader(session);

    await user.click(screen.getByRole("button", { name: "退出登录" }));

    expect(api.logout).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({
      accessToken: null,
      currentUser: null,
      currentOrganization: null,
      role: null,
      permissions: [],
      session: null,
      status: "anonymous",
    });
  });

  it("clears complete local authentication even when remote logout fails", async () => {
    const user = userEvent.setup();
    const { session } = createAuthSession({
      logout: vi.fn().mockRejectedValue(new Error("session token=secret")),
    });
    const store = renderUserHeader(session);

    await user.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(store.getState()).toMatchObject({
        accessToken: null,
        currentUser: null,
        currentOrganization: null,
        role: null,
        permissions: [],
        session: null,
        status: "anonymous",
      });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("退出登录失败，请稍后重试。");
    expect(screen.queryByText(/token=secret/i)).not.toBeInTheDocument();
  });

  it("clears loaded organization options and disables the switcher after auth is cleared", async () => {
    const user = userEvent.setup();
    const { session } = createAuthSession();
    const store = renderUserHeader(session);
    const switcher = await screen.findByRole("button", { name: /当前组织/ });
    await waitFor(() => expect(switcher).toBeEnabled());

    act(() => store.getState().clearAuth());

    await waitFor(() => expect(switcher).toBeDisabled());
    await user.click(switcher);
    expect(screen.queryByRole("option", { name: "家庭账本" })).not.toBeInTheDocument();
  });
});
