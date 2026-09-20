import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode, CurrentUserResponse, RouteKey } from "@xpense/shared";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { useEffect, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import type { RegisteredPageDescriptor } from "@/routes/-shared/registered-page";
import { createWebSession } from "@/services/web-session";
import { createAuthStore } from "@/stores/auth-store";

import { AuthenticatedLayout } from "./authenticated-layout";
import { PageCacheHost, type PageCacheHostPage } from "./page-cache-host";
import type { PageCacheParams } from "./page-cache-store";
import type { PageWorkspaceStorage } from "./page-workspace-persistence";

const AUTHORIZATION_VERSION_1 = {};
const AUTHORIZATION_VERSION_2 = {};

class MemoryStorage implements PageWorkspaceStorage {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

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
  routeKey = menuId === 2 ? "Roles" : menuId === 3 ? "AuditLogs" : "Members",
}: {
  authorizationSource?: "local" | "resolved";
  keepAlive?: boolean;
  label: string;
  menuId: number;
  params?: PageCacheParams;
  query?: string;
  routeKey?: RouteKey;
}): PageCacheHostPage {
  return {
    authorizationSource,
    href: `/${label}${query ? `?${query}` : ""}`,
    keepAlive,
    menuId,
    params,
    render: () => <StatefulPage label={label} query={query} />,
    routeKey,
    title: label,
  };
}

function createRegisteredPageDescriptor(
  routeKey: "Dashboard" | "Members" | "Roles",
): RegisteredPageDescriptor {
  return {
    routeKey,
    cacheParams: {},
    render: () => <StatefulPage label={routeKey} />,
  };
}

function cacheableMenus(...menuIds: number[]): ReadonlySet<number> {
  return new Set(menuIds);
}

function authorizedMenu(routeKey: RouteKey, id: number, keepAlive = true): AuthorizedMenuNode {
  const permissionCode =
    routeKey === "Dashboard"
      ? "dashboard:read"
      : routeKey === "Members"
        ? "members:read"
        : "roles:read";

  return {
    id,
    parentId: null,
    type: "menu",
    name: routeKey,
    sortOrder: id,
    icon: null,
    isVisible: true,
    routeKey,
    path: routeKey === "Dashboard" ? "/" : routeKey === "Members" ? "/members" : "/roles",
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
  it("closes the active tab by navigating to its right neighbor first", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [routeKey, setRouteKey] = useState<"Members" | "Roles" | "Sessions">("Members");
      const active =
        routeKey === "Members"
          ? createPage({ label: "members", menuId: 1, routeKey })
          : routeKey === "Roles"
            ? createPage({ label: "roles", menuId: 2, routeKey })
            : createPage({ label: "sessions", menuId: 3, routeKey });

      return (
        <>
          <button onClick={() => setRouteKey("Roles")} type="button">
            访问角色
          </button>
          <button onClick={() => setRouteKey("Sessions")} type="button">
            访问会话
          </button>
          <PageCacheHost
            activePage={active}
            authorizationVersion={AUTHORIZATION_VERSION_1}
            cacheableMenuIds={cacheableMenus(1, 2, 3)}
            navigate={async (href) => {
              setRouteKey(
                href === "/members" ? "Members" : href === "/roles" ? "Roles" : "Sessions",
              );
            }}
            scopeKey="org-1"
          />
        </>
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "访问角色" }));
    await user.click(screen.getByRole("button", { name: "访问会话" }));
    await user.click(screen.getByRole("button", { name: "roles" }));
    await user.click(screen.getByRole("button", { name: "关闭“roles”" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "sessions" })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
    expect(screen.queryByRole("button", { name: "roles" })).not.toBeInTheDocument();
  });

  it("keeps the active tab when navigation to its close target fails", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn().mockRejectedValue(new Error("navigation failed"));
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        navigate={navigate}
        scopeKey="org-1"
      />,
    );
    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        navigate={navigate}
        scopeKey="org-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "关闭“roles”" }));
    await act(async () => Promise.resolve());

    expect(screen.getByRole("button", { name: "roles" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "members" })).toBeInTheDocument();
  });

  it("keeps the last tab when navigation to the home page fails", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn().mockRejectedValue(new Error("navigation failed"));

    render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1)}
        navigate={navigate}
        scopeKey="org-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "关闭“members”" }));
    await act(async () => Promise.resolve());

    expect(navigate).toHaveBeenCalledWith("/");
    expect(screen.getByRole("button", { name: "members" })).toBeInTheDocument();
  });

  it("restores persisted tabs as metadata and navigates to their latest href", async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    const workspaceScope = { organizationId: "org-1", userId: "user-1" };
    const restorableMenus = new Map([["Members" as const, { id: 1, title: "成员管理" }]]);
    const firstView = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1, query: "page=2" })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1)}
        cacheableMenus={restorableMenus}
        scopeKey="org-1"
        storage={storage}
        workspaceScope={workspaceScope}
      />,
    );

    await waitFor(() => expect(storage.length).toBe(1));
    firstView.unmount();
    const navigate = vi.fn();

    render(
      <PageCacheHost
        activePage={null}
        authorizationVersion={AUTHORIZATION_VERSION_2}
        cacheableMenuIds={cacheableMenus(1)}
        cacheableMenus={restorableMenus}
        fallback={<p>当前没有活动缓存页</p>}
        navigate={navigate}
        scopeKey="org-1"
        storage={storage}
        workspaceScope={workspaceScope}
      />,
    );

    expect(screen.getByRole("button", { name: "成员管理" })).toBeInTheDocument();
    expect(screen.queryByTestId("page-members")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "成员管理" }));

    expect(navigate).toHaveBeenCalledWith("/members?page=2");
  });

  it("removes unauthorized tabs from runtime and persisted workspace", async () => {
    const storage = new MemoryStorage();
    const workspaceScope = { organizationId: "org-1", userId: "user-1" };
    const allMenus = new Map([
      ["Members" as const, { id: 1, title: "members" }],
      ["Roles" as const, { id: 2, title: "roles" }],
    ]);
    const rolesOnly = new Map([["Roles" as const, { id: 2, title: "roles" }]]);
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        cacheableMenus={allMenus}
        scopeKey="org-1"
        storage={storage}
        workspaceScope={workspaceScope}
      />,
    );
    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        cacheableMenus={allMenus}
        scopeKey="org-1"
        storage={storage}
        workspaceScope={workspaceScope}
      />,
    );

    expect(screen.getByRole("button", { name: "members" })).toBeInTheDocument();

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        authorizationVersion={AUTHORIZATION_VERSION_2}
        cacheableMenuIds={cacheableMenus(2)}
        cacheableMenus={rolesOnly}
        scopeKey="org-1"
        storage={storage}
        workspaceScope={workspaceScope}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "members" })).not.toBeInTheDocument();
      expect(JSON.parse([...storage.values.values()][0] ?? "null")?.tabs).toEqual([
        expect.objectContaining({ routeKey: "Roles" }),
      ]);
    });
  });

  it("shows cached pages as stable tabs and refreshes the active tab href", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const view = render(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        navigate={navigate}
        scopeKey="org-1"
      />,
    );

    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "roles", menuId: 2 })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        navigate={navigate}
        scopeKey="org-1"
      />,
    );
    view.rerender(
      <PageCacheHost
        activePage={createPage({ label: "members", menuId: 1, query: "page=2" })}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus(1, 2)}
        navigate={navigate}
        scopeKey="org-1"
      />,
    );

    expect(screen.getAllByRole("button", { name: "members" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "members" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "roles" }));
    await user.click(screen.getByRole("button", { name: "members" }));

    expect(navigate).toHaveBeenNthCalledWith(1, "/roles");
    expect(navigate).toHaveBeenNthCalledWith(2, "/members?page=2");
  });

  it("navigates between cached tabs through the real router", async () => {
    const user = userEvent.setup();
    const membersMenu = authorizedMenu("Members", 1);
    const rolesMenu = authorizedMenu("Roles", 2);
    const authStore = createAuthStore({ accessToken: "access-token" });
    authStore.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock
      .onGet(/\/menus$/)
      .reply(200, { code: "OK", message: "ok", data: [membersMenu, rolesMenu] });
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const session = createWebSession({ authStore, baseUrl: "http://localhost:4000", instance });
    await vi.waitFor(() => expect(session.menuStore.getState().status).toBe("ready"));
    const rootRoute = createRootRoute({
      component: () => <AuthenticatedLayout session={session} />,
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      staticData: { routeKey: "Members" },
      beforeLoad: () => ({ registeredPage: createRegisteredPageDescriptor("Members") }),
      component: () => null,
    });
    const rolesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/roles",
      staticData: { routeKey: "Roles" },
      beforeLoad: () => ({ registeredPage: createRegisteredPageDescriptor("Roles") }),
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

    expect(await screen.findByTestId("page-Members")).toBeVisible();
    await act(async () => router.navigate({ to: "/roles" } as never));
    expect(await screen.findByTestId("page-Roles")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Members" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/members"));
    expect(screen.getByTestId("page-Members")).toBeVisible();
    expect(screen.getByRole("button", { name: "Members" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Roles" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/roles"));
    expect(screen.getByTestId("page-Roles")).toBeVisible();
  });

  it("closes the last cached tab and navigates to the dashboard", async () => {
    const user = userEvent.setup();
    const dashboardMenu = authorizedMenu("Dashboard", 1);
    const membersMenu = authorizedMenu("Members", 2);
    const authStore = createAuthStore({ accessToken: "access-token" });
    authStore.getState().setCurrentUserContext(userContext);
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock
      .onGet(/\/menus$/)
      .reply(200, { code: "OK", message: "ok", data: [dashboardMenu, membersMenu] });
    mock.onAny().reply(200, { code: "OK", message: "ok", data: [] });
    const session = createWebSession({ authStore, baseUrl: "http://localhost:4000", instance });
    await vi.waitFor(() => expect(session.menuStore.getState().status).toBe("ready"));
    const rootRoute = createRootRoute({
      component: () => <AuthenticatedLayout session={session} />,
    });
    const dashboardRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      staticData: { routeKey: "Dashboard" },
      beforeLoad: () => ({ registeredPage: createRegisteredPageDescriptor("Dashboard") }),
      component: () => null,
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      staticData: { routeKey: "Members" },
      beforeLoad: () => ({ registeredPage: createRegisteredPageDescriptor("Members") }),
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([dashboardRoute, membersRoute]),
      history: createMemoryHistory({ initialEntries: ["/members"] }),
    });

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    expect(await screen.findByTestId("page-Members")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭“Members”" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByTestId("page-Dashboard")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Members" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

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
          href: "/temporary",
          keepAlive: false,
          menuId: 5,
          params: {},
          render: () => <DisposablePage />,
          routeKey: "Members",
          title: "临时页面",
        }}
        authorizationVersion={AUTHORIZATION_VERSION_1}
        cacheableMenuIds={cacheableMenus()}
        scopeKey="org-1"
      />,
    );

    expect(screen.queryByRole("navigation", { name: "已打开页面" })).not.toBeInTheDocument();

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
          href: "/members",
          keepAlive: true,
          menuId: 1,
          params: {},
          render: () => <CountedPage />,
          routeKey: "Members",
          title: "成员管理",
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
      component: () => <AuthenticatedLayout session={session} />,
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      staticData: { routeKey: "Members" },
      beforeLoad: () => ({ registeredPage: createRegisteredPageDescriptor("Members") }),
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
      component: () => <AuthenticatedLayout session={session} />,
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      staticData: { routeKey: "Members" },
      beforeLoad: () => ({ registeredPage: createRegisteredPageDescriptor("Members") }),
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
      component: () => <AuthenticatedLayout session={session} />,
    });
    const membersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/members",
      staticData: { routeKey: "Members" },
      beforeLoad: () => ({
        registeredMenu: membersMenu,
        registeredMenuAuthorization: session.menuStore.getState().byRouteKey,
        registeredPage: createRegisteredPageDescriptor("Members"),
      }),
      component: () => null,
    });
    const rolesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/roles",
      staticData: { routeKey: "Roles" },
      beforeLoad: () => ({ registeredPage: createRegisteredPageDescriptor("Roles") }),
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
