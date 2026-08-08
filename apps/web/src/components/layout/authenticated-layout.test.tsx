import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CurrentUserResponse } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, expect, it } from "vitest";
import { useStore } from "zustand";

import { AppProviders } from "@/components/app-providers";
import { createWebSession, type WebSessionDependency } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";

import { AuthenticatedLayout } from "./authenticated-layout";

const userContext: CurrentUserResponse = {
  user: { id: "user-1", email: "owner@example.com", isSuperAdmin: false, status: "active" },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members:read"],
  session: { id: "session-1", clientType: "web_pc" },
};

function ConditionalAuthenticatedLayout({ session }: { session: WebSessionDependency }) {
  const isAuthenticated = useStore(session.authStore, (state) => state.status === "authenticated");

  return isAuthenticated ? <AuthenticatedLayout session={session} /> : <p>已退出</p>;
}

describe("AuthenticatedLayout", () => {
  it("呈现当前会话的组织、邮箱与获授权导航控制项", async () => {
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet("http://localhost:4000/menus").reply(200, {
      code: "OK",
      message: "ok",
      data: [
        {
          id: "1",
          name: "仪表盘",
          path: "/",
          parentId: null,
          componentKey: "DashboardPage",
          icon: "LayoutDashboard",
          permissionCode: null,
          sortOrder: 0,
          children: [],
        },
        {
          id: "2",
          name: "访问控制",
          path: "",
          parentId: null,
          componentKey: null,
          icon: "ShieldCheck",
          permissionCode: null,
          sortOrder: 10,
          children: [
            {
              id: "3",
              name: "成员",
              path: "/members",
              parentId: "2",
              componentKey: "MembersPage",
              icon: "Users",
              permissionCode: "members:read",
              sortOrder: 0,
              children: [],
            },
          ],
        },
      ],
    });
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
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

  it("在退出请求失败且壳层卸载后仍显示全局错误反馈", async () => {
    const user = userEvent.setup();
    const store = createAuthStore({ accessToken: "access-token" });
    store.getState().setCurrentUserContext(userContext);
    let rejectLogout: (reason?: unknown) => void = () => undefined;
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onPost(/\/auth\/logout$/).reply(
      () =>
        new Promise<[number, unknown]>((_resolve, reject) => {
          rejectLogout = reject;
        }),
    );
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const session = createWebSession({
      authStore: store,
      baseUrl: "http://localhost:4000",
      instance,
    });
    const rootRoute = createRootRoute({
      component: () => <ConditionalAuthenticatedLayout session={session} />,
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

    await user.click(await screen.findByRole("button", { name: /owner@example.com/ }));
    await user.click(screen.getByRole("menuitem", { name: "退出登录" }));

    expect(await screen.findByText("已退出")).toBeInTheDocument();

    await act(async () => rejectLogout(new Error("logout failed")));

    expect(await screen.findByText("退出登录失败，请稍后重试。")).toBeInTheDocument();
  });
});
