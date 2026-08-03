import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";

vi.stubGlobal(
  "ResizeObserver",
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
);

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

const userContext: CurrentUserResponse = {
  user: { id: "user-1", email: "owner@example.com", isSuperAdmin: false, status: "active" },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members.read"],
  session: { id: "session-1", clientType: "web_pc" },
};

describe("CommandMenu", () => {
  it("通过快捷键打开，并且不展示未授权路由", async () => {
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify([]))) as typeof fetch,
    });
    const rootRoute = createRootRoute({
      component: () => <AuthenticatedLayout session={session} />,
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <main>受保护内容</main>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const dialog = await screen.findByRole("dialog");
    const dialogQueries = within(dialog);
    expect(dialogQueries.getByText("成员")).toBeInTheDocument();
    expect(dialogQueries.queryByText("角色")).not.toBeInTheDocument();
    expect(dialogQueries.queryByText("会话")).not.toBeInTheDocument();
    expect(dialogQueries.queryByText("审计日志")).not.toBeInTheDocument();
  });
});
