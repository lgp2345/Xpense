import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode, CurrentUserResponse, RouteKey } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { useEffect, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";

import { AuthenticatedLayout } from "./authenticated-layout";
import { PageCacheHost, type PageCacheHostPage } from "./page-cache-host";

const AUTHORIZATION_VERSION_1 = {};
const AUTHORIZATION_VERSION_2 = {};

function StatefulPage({ label, query }: { label: string; query?: string }) {
  const [count, setCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section data-testid={`page-${label}`}>
      <p>{label}</p>
      <p data-testid={`query-${label}`}>{query}</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        count {count}
      </button>
      <input aria-label={`input-${label}`} ref={inputRef} />
    </section>
  );
}

function createPage({
  authorizationSource = "local",
  keepAlive = true,
  label,
  menuId,
  params = {},
  query,
}: {
  authorizationSource?: "local" | "resolved";
  keepAlive?: boolean;
  label: string;
  menuId: number;
  params?: Record<string, unknown>;
  query?: string;
}): PageCacheHostPage {
  return {
    authorizationSource,
    keepAlive,
    menuId,
    params,
    render: () => <StatefulPage label={label} query={query} />,
  };
}

function cacheableMenus(...menuIds: number[]): ReadonlySet<number> {
  return new Set(menuIds);
}

function authorizedMenu(routeKey: RouteKey, id: number, keepAlive = true): AuthorizedMenuNode {
  const permissionCode = routeKey === "Members" ? "members:read" : "roles:read";

  return {
    id,
    parentId: null,
    type: "menu",
    name: routeKey,
    sortOrder: id,
    icon: null,
    isVisible: true,
    routeKey,
    path: routeKey === "Members" ? "/members" : "/roles",
    url: null,
    permissionCode,
    isExternal: false,
    keepAlive,
    children: [],
  } as AuthorizedMenuNode;
}

const userContext: CurrentUserResponse = {
  user: { id: "user-1", email: "owner@example.com", isSuperAdmin: false, status: "active" },
  organization: { id: "org-1", name: "个人账本" },
  role: { id: "role-1", key: "owner", name: "所有者" },
  permissions: ["members:read", "roles:read"],
  session: { id: "session-1", clientType: "web_pc" },
};

describe("PageCacheHost", () => {
  it("switches cached pages between visible and hidden while preserving React and DOM state", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        scopeKey="org-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "count 0" }));
    await user.type(screen.getByRole("textbox", { name: "input-members" }), "保留的输入");
    const membersDom = screen.getByTestId("page-members");

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        scopeKey="org-1"
      />,
    );

    expect(membersDom).not.toBeVisible();
    expect(screen.getByTestId("page-roles")).toBeVisible();

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        scopeKey="org-1"
      />,
    );

    expect(screen.getByTestId("page-members")).toBe(membersDom);
    expect(screen.getByRole("button", { name: "count 1" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "input-members" })).toHaveValue("保留的输入");
  });

  it("updates captured query props without resetting the cache identity", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({
          authorizationSource: "resolved",
          label: "audit",
          menuId: 3,
          query: "page=1",
        })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-audit" }), "筛选草稿");
    const auditDom = screen.getByTestId("page-audit");

    view.rerender(
      <PageCacheHost
        activePage={createPage({
          authorizationSource: "resolved",
          label: "audit",
          menuId: 3,
          query: "page=2",
        })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    expect(screen.getByTestId("page-audit")).toBe(auditDom);
    expect(screen.getByTestId("query-audit")).toHaveTextContent("page=2");
    expect(screen.getByRole("textbox", { name: "input-audit" })).toHaveValue("筛选草稿");
  });

  it("keeps different route params as distinct cached page instances", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "member-1", menuId: 4, params: { memberId: "1" } })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(4)}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-member-1" }), "实例一");

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "member-2", menuId: 4, params: { memberId: "2" } })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(4)}
        scopeKey="org-1"
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "input-member-2" }), "实例二");

    expect(screen.getByTestId("page-member-1")).not.toBeVisible();
    expect(screen.getByRole("textbox", { name: "input-member-2" })).toHaveValue("实例二");

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "member-1", menuId: 4, params: { memberId: "1" } })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(4)}
        scopeKey="org-1"
      />,
    );

    expect(screen.getByRole("textbox", { name: "input-member-1" })).toHaveValue("实例一");
    expect(screen.getByTestId("page-member-2")).not.toBeVisible();
  });

  it("unmounts non-keepalive pages when navigation leaves them", () => {
    const onUnmount = vi.fn();

    function DisposablePage() {
      useEffect(() => onUnmount, []);
      return <p>一次性页面</p>;
    }

    const view = render(
      <PageCacheHost
        activePage={{
          authorizationSource: "local",
          keepAlive: false,
          menuId: 5,
          params: {},
          render: () => <DisposablePage />,
        }}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-1"
      />,
    );

    expect(screen.queryByText("一次性页面")).not.toBeInTheDocument();
    expect(onUnmount).toHaveBeenCalledOnce();
  });

  it("clears cached pages on logout", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-members" }), "旧组织状态");

    view.rerender(
      <PageCacheHost
        activePage={null}
        authorizationVersion={null}
        cacheableMenuIds={cacheableMenus()}
        fallback={<p>已退出</p>}
        scopeKey={null}
      />,
    );
    expect(screen.queryByTestId("page-members")).not.toBeInTheDocument();
  });

  it("does not reuse the same page identity across a direct organization switch", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-members" }), "旧组织状态");

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-2"
      />,
    );

    expect(screen.getByRole("textbox", { name: "input-members" })).toHaveValue("");
  });

  it.each([
    "permission loss",
    "menu deletion",
  ])("evicts a cached page after %s removes its menu authorization", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-members" }), "待淘汰状态");
    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        scopeKey="org-1"
      />,
    );
    expect(screen.getByTestId("page-members")).toBeInTheDocument();

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        authorizationVersion={AUTHORIZATION_VERSION_2}
        cacheableMenuIds={cacheableMenus(2)}
        scopeKey="org-1"
      />,
    );

    expect(screen.queryByTestId("page-members")).not.toBeInTheDocument();
  });

  it("never renders duplicate instances of the active cached page", () => {
    let renderCount = 0;

    function CountedPage() {
      renderCount += 1;
      return <p>唯一页面</p>;
    }

    render(
      <PageCacheHost
        activePage={{
          authorizationSource: "local",
          keepAlive: true,
          menuId: 1,
          params: {},
          render: () => <CountedPage />,
        }}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-1"
      />,
    );

    expect(screen.getAllByText("唯一页面")).toHaveLength(1);
    expect(renderCount).toBe(1);
  });

  it("keeps a server-resolved keepalive page for the current authorization version", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ authorizationSource: "resolved", label: "resolved", menuId: 7 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-resolved" }), "服务端授权状态");
    const resolvedDom = screen.getByTestId("page-resolved");

    view.rerender(
      <PageCacheHost
        activePage={createPage({ keepAlive: false, label: "roles", menuId: 2 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(2)}
        scopeKey="org-1"
      />,
    );

    expect(resolvedDom).not.toBeVisible();

    view.rerender(
      <PageCacheHost
        activePage={createPage({ authorizationSource: "resolved", label: "resolved", menuId: 7 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    expect(screen.getByTestId("page-resolved")).toBe(resolvedDom);
    expect(screen.getByRole("textbox", { name: "input-resolved" })).toHaveValue("服务端授权状态");
  });

  it("keeps a still-authorized page hidden during menu refresh and restores the same instance", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-members" }), "刷新前状态");
    const membersDom = screen.getByTestId("page-members");

    view.rerender(
      <PageCacheHost
        activePage={null}
        authorizationVersion={null}
        cacheableMenuIds={cacheableMenus()}
        fallback={<p>正在加载组织菜单...</p>}
        scopeKey="org-1"
      />,
    );

    expect(membersDom).not.toBeVisible();
    expect(screen.getByText("正在加载组织菜单...")).toBeVisible();

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_2}
        cacheableMenuIds={cacheableMenus(1)}
        scopeKey="org-1"
      />,
    );

    expect(screen.getByTestId("page-members")).toBe(membersDom);
    expect(screen.getByRole("textbox", { name: "input-members" })).toHaveValue("刷新前状态");
  });

  it("evicts a server-resolved page when a new authorization version does not include it", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({ authorizationSource: "resolved", label: "resolved", menuId: 7 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-resolved" }), "待失效状态");

    view.rerender(
      <PageCacheHost
        activePage={null}
        authorizationVersion={null}
        cacheableMenuIds={cacheableMenus()}
        fallback={<p>正在加载组织菜单...</p>}
        scopeKey="org-1"
      />,
    );
    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        authorizationVersion={AUTHORIZATION_VERSION_2}
        cacheableMenuIds={cacheableMenus(2)}
        scopeKey="org-1"
      />,
    );

    expect(screen.queryByTestId("page-resolved")).not.toBeInTheDocument();
  });

  it("keeps the Activity host mounted across a ready-loading-ready menu refresh", async () => {
    const user = userEvent.setup();
    const membersMenu = authorizedMenu("Members", 1);
    const authStore = createAuthStore({ accessToken: "access-token" });
    authStore.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/menus$/).reply(200, { code: "OK", message: "ok", data: [membersMenu] });
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const session = createWebSession({ authStore, baseUrl: "http://localhost:4000", instance });
    await vi.waitFor(() => expect(session.menuStore.getState().status).toBe("ready"));
    const rootRoute = createRootRoute({
      component: () => (
        <AuthenticatedLayout
          renderRegisteredPage={({ routeKey }) => <StatefulPage label={routeKey} />}
          session={session}
        />
      ),
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      staticData: { routeKey: "Members" },
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([membersRoute]),
      history: createMemoryHistory({ initialEntries: ["/members"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    await user.type(await screen.findByRole("textbox", { name: "input-Members" }), "刷新前状态");
    const membersDom = screen.getByTestId("page-Members");
    let finishRefresh: (menus: AuthorizedMenuNode[]) => void = () => undefined;
    const refreshMenus = new Promise<AuthorizedMenuNode[]>((resolve) => {
      finishRefresh = resolve;
    });
    let refresh: Promise<void>;

    act(() => {
      refresh = session.menuStore.getState().loadMenusForOrganization("org-1", () => refreshMenus);
    });

    expect(await screen.findByText("正在加载组织菜单...")).toBeVisible();
    expect(document.querySelector("main main")).not.toBeInTheDocument();

    await act(async () => {
      finishRefresh([membersMenu]);
      await refresh;
    });

    expect(screen.getByTestId("page-Members")).toBe(membersDom);
    expect(screen.getByRole("textbox", { name: "input-Members" })).toHaveValue("刷新前状态");
  });

  it("renders the menu error fallback without nesting main landmarks", async () => {
    const membersMenu = authorizedMenu("Members", 1);
    const authStore = createAuthStore({ accessToken: "access-token" });
    authStore.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/menus$/).reply(200, { code: "OK", message: "ok", data: [membersMenu] });
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const session = createWebSession({ authStore, baseUrl: "http://localhost:4000", instance });
    await vi.waitFor(() => expect(session.menuStore.getState().status).toBe("ready"));
    const rootRoute = createRootRoute({
      component: () => (
        <AuthenticatedLayout
          renderRegisteredPage={({ routeKey }) => <StatefulPage label={routeKey} />}
          session={session}
        />
      ),
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      staticData: { routeKey: "Members" },
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([membersRoute]),
      history: createMemoryHistory({ initialEntries: ["/members"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );
    expect(await screen.findByTestId("page-Members")).toBeVisible();

    await act(async () => {
      await session.menuStore
        .getState()
        .loadMenusForOrganization("org-1", () => Promise.reject(new Error("refresh failed")));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("菜单加载失败，请稍后重试。");
    expect(screen.getByRole("button", { name: "重试" })).toBeVisible();
    expect(document.querySelector("main main")).not.toBeInTheDocument();
  });

  it("does not reuse a resolved entry when the same menu id becomes local in a new version", async () => {
    const user = userEvent.setup();
    const view = render(
      <PageCacheHost
        activePage={createPage({
          authorizationSource: "resolved",
          label: "members",
          menuId: 7,
        })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "input-members" }), "旧解析状态");
    const resolvedDom = screen.getByTestId("page-members");

    view.rerender(
      <PageCacheHost
        activePage={null}
        authorizationVersion={null}
        cacheableMenuIds={cacheableMenus()}
        fallback={<p>正在加载组织菜单...</p>}
        scopeKey="org-1"
      />,
    );
    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 7 })}
        authorizationVersion={AUTHORIZATION_VERSION_2}
        cacheableMenuIds={cacheableMenus(7)}
        scopeKey="org-1"
      />,
    );

    expect(screen.getByTestId("page-members")).not.toBe(resolvedDom);
    expect(screen.getByRole("textbox", { name: "input-members" })).toHaveValue("");
  });

  it("keeps a local-miss server-resolved page when navigating away and back", async () => {
    const user = userEvent.setup();
    const membersMenu = authorizedMenu("Members", 7);
    const rolesMenu = authorizedMenu("Roles", 2, false);
    const authStore = createAuthStore({ accessToken: "access-token" });
    authStore.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/menus$/).reply(200, { code: "OK", message: "ok", data: [rolesMenu] });
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const session = createWebSession({ authStore, baseUrl: "http://localhost:4000", instance });
    await vi.waitFor(() => expect(session.menuStore.getState().status).toBe("ready"));
    const rootRoute = createRootRoute({
      component: () => (
        <AuthenticatedLayout
          renderRegisteredPage={({ routeKey }) => <StatefulPage label={routeKey} />}
          session={session}
        />
      ),
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      staticData: { routeKey: "Members" },
      beforeLoad: () => ({
        registeredMenu: membersMenu,
        registeredMenuAuthorization: session.menuStore.getState().byRouteKey,
      }),
      component: () => null,
    });
    const rolesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/roles",
      staticData: { routeKey: "Roles" },
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([membersRoute, rolesRoute]),
      history: createMemoryHistory({ initialEntries: ["/members"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    await user.type(
      await screen.findByRole("textbox", { name: "input-Members" }),
      "服务端授权状态",
    );
    const membersDom = screen.getByTestId("page-Members");

    await act(async () => router.navigate({ to: "/roles" } as never));

    expect(membersDom).not.toBeVisible();
    expect(screen.getByTestId("page-Roles")).toBeVisible();

    await act(async () => router.navigate({ to: "/members" } as never));

    expect(screen.getByTestId("page-Members")).toBe(membersDom);
    expect(screen.getByRole("textbox", { name: "input-Members" })).toHaveValue("服务端授权状态");

    await act(async () => {
      await session.menuStore
        .getState()
        .loadMenusForOrganization("org-1", () => Promise.resolve([rolesMenu]));
    });

    expect(screen.queryByTestId("page-Members")).not.toBeInTheDocument();
  });
});
