import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { CurrentUserResponse } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";

import { AuthenticatedLayout } from "./authenticated-layout";

const userContext: CurrentUserResponse = {
  user: { id: "user-1", email: "owner@example.com", isSuperAdmin: false, status: "active" },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members.read"],
  session: { id: "session-1", clientType: "web_pc" },
};

describe("AuthenticatedLayout", () => {
  it("呈现当前会话的组织、邮箱与获授权导航控制项", async () => {
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

    expect(await screen.findByText("个人账本")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "成员" })).toHaveAttribute("href", "/members");
    expect(screen.queryByRole("link", { name: "角色" })).not.toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="trigger"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换主题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "搜索命令" })).toBeInTheDocument();
  });
});
