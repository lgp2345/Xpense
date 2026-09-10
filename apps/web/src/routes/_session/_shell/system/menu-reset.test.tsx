import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../../../../components/app-providers";
import { createAppRouter } from "../../../../router";
import type { WebSessionDependency } from "../../../../services/web-session";
import { createAuthStore } from "../../../../stores/auth-store";
import { createMenuStore } from "../../../../stores/menu-store";

function createSession(isSuperAdmin = false): WebSessionDependency {
  return {
    authApi: {} as WebSessionDependency["authApi"],
    authStore: createAuthStore({
      accessToken: "access-token",
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        isSuperAdmin,
        status: "active",
      },
      currentOrganization: { id: "org-1", name: "个人账本" },
      role: { id: "role-1", key: "owner", name: "所有者" },
      session: { id: "session-1", clientType: "web_pc" },
      status: "authenticated",
    }),
    bookkeepingApi: {} as WebSessionDependency["bookkeepingApi"],
    iamApi: {} as WebSessionDependency["iamApi"],
    menuStore: createMenuStore(),
    rentalApi: {} as WebSessionDependency["rentalApi"],
    restoreSession: vi.fn().mockResolvedValue(true),
  };
}

describe("public and session-only routes", () => {
  it("keeps forbidden outside menu bootstrap", async () => {
    const session = createSession();
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/forbidden"] }),
      session,
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: /无权限访问/ })).toBeInTheDocument();
    expect(session.menuStore.getState().status).toBe("idle");
  });

  it("redirects a non-super-admin away from menu reset", async () => {
    const session = createSession();
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ["/system/menu-reset"] }),
      session,
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/forbidden");
  });
});
