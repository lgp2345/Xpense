import { createMemoryHistory } from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createAuthStore } from "../stores/auth-store";
import { AppRouter, createAppRouter } from "./router";

describe("AppRouter startup", () => {
  it("waits for cookie session restoration before rendering protected content", async () => {
    const store = createAuthStore();
    const router = createAppRouter({
      authStore: store,
      history: createMemoryHistory({ initialEntries: ["/"] }),
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

    render(<AppRouter restoreSession={restoreSession} router={router} />);

    expect(screen.getByText("正在恢复会话...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "财务洞察" })).not.toBeInTheDocument();

    await act(async () => finishRestore?.());

    expect(await screen.findByRole("heading", { name: "财务洞察" })).toBeInTheDocument();
  });

  it("restores the cookie session only once in React StrictMode", () => {
    const restoreSession = vi.fn(() => new Promise<boolean>(() => undefined));
    const router = createAppRouter({
      authStore: createAuthStore(),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(
      <StrictMode>
        <AppRouter restoreSession={restoreSession} router={router} />
      </StrictMode>,
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
      permissions: ["members.read"],
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    });
    const router = createAppRouter({
      authStore: store,
      history: createMemoryHistory({ initialEntries: ["/members"] }),
    });

    render(<AppRouter restoreSession={vi.fn().mockResolvedValue(true)} router={router} />);
    expect(await screen.findByRole("heading", { name: "成员管理" })).toBeInTheDocument();

    act(() => store.getState().clearAuth());

    expect(await screen.findByRole("heading", { name: "登录到你的账本" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ redirect: "/members" });
  });
});
