import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../components/app-providers";
import { createAppRouter } from "../router";
import type { WebSessionDependency } from "../services/web-session";
import { createAuthStore } from "../stores/auth-store";
import { createMenuStore } from "../stores/menu-store";

function createSession(): WebSessionDependency {
  return {
    authApi: {} as WebSessionDependency["authApi"],
    authStore: createAuthStore(),
    bookkeepingApi: {} as WebSessionDependency["bookkeepingApi"],
    iamApi: {} as WebSessionDependency["iamApi"],
    menuStore: createMenuStore(),
    rentalApi: {} as WebSessionDependency["rentalApi"],
    restoreSession: vi.fn().mockResolvedValue(false),
  };
}

function createAuthenticatedSession(): WebSessionDependency {
  return {
    ...createSession(),
    authStore: createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin: false,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "owner", name: "所有者" },
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    }),
  };
}

describe("/login", () => {
  it("renders login with a safe redirect for an anonymous session", async () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/login?redirect=/members"] }),
      session: createSession(),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: /登录/ })).toBeInTheDocument();
  });

  it("redirects an authenticated session to the root for an unsafe redirect", async () => {
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/login?redirect=//evil.example"] }),
      session: createAuthenticatedSession(),
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/");
  });
});
