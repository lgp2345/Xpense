import type { AuthorizedMenuNode } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { createMenuStore } from "./menu-store";

const organizationOneTree: AuthorizedMenuNode[] = [
  {
    id: 1,
    parentId: null,
    type: "directory",
    name: "访问控制",
    sortOrder: 0,
    icon: "ShieldCheck",
    isVisible: true,
    routeKey: null,
    path: null,
    url: null,
    permissionCode: null,
    isExternal: null,
    keepAlive: null,
    children: [
      {
        id: 2,
        parentId: 1,
        type: "menu",
        name: "成员",
        sortOrder: 0,
        icon: "Users",
        isVisible: true,
        routeKey: "Members",
        path: "/members",
        url: null,
        permissionCode: "members:read",
        isExternal: false,
        keepAlive: false,
        children: [],
      },
    ],
  },
];

const organizationTwoTree: AuthorizedMenuNode[] = [
  {
    id: 3,
    parentId: null,
    type: "menu",
    name: "仪表盘",
    sortOrder: 0,
    icon: "LayoutDashboard",
    isVisible: true,
    routeKey: "Dashboard",
    path: "/",
    url: null,
    permissionCode: "dashboard:read",
    isExternal: false,
    keepAlive: false,
    children: [],
  },
];

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe("menu store", () => {
  it("moves from idle through loading to ready and indexes nested routes once", async () => {
    const store = createMenuStore();
    const request = createDeferred<AuthorizedMenuNode[]>();

    const loading = store.getState().loadMenusForOrganization("org-1", () => request.promise);

    expect(store.getState()).toMatchObject({
      organizationId: "org-1",
      status: "loading",
      tree: [],
      error: null,
    });

    request.resolve(organizationOneTree);
    await loading;

    expect(store.getState()).toMatchObject({
      organizationId: "org-1",
      status: "ready",
      tree: organizationOneTree,
      error: null,
    });
    expect(store.getState().getAuthorizedRoute("Members")?.id).toBe(2);
    expect(store.getState().getAuthorizedRoute("Roles")).toBeUndefined();
  });

  it("returns the same promise and sends one request for concurrent loads of one organization", async () => {
    const store = createMenuStore();
    const request = createDeferred<AuthorizedMenuNode[]>();
    const loadMenus = vi.fn(() => request.promise);

    const firstLoad = store.getState().loadMenusForOrganization("org-1", loadMenus);
    const secondLoad = store.getState().loadMenusForOrganization("org-1", loadMenus);

    expect(secondLoad).toBe(firstLoad);
    expect(loadMenus).toHaveBeenCalledOnce();

    request.resolve(organizationOneTree);
    await firstLoad;
  });

  it("keeps authentication-independent error state retryable", async () => {
    const store = createMenuStore();
    const loadMenus = vi
      .fn<() => Promise<AuthorizedMenuNode[]>>()
      .mockRejectedValueOnce(new Error("network details"))
      .mockResolvedValueOnce(organizationOneTree);

    await store.getState().loadMenusForOrganization("org-1", loadMenus);

    expect(store.getState()).toMatchObject({
      organizationId: "org-1",
      status: "error",
      tree: [],
      error: "菜单加载失败，请稍后重试。",
    });

    await store.getState().loadMenusForOrganization("org-1", loadMenus);

    expect(store.getState()).toMatchObject({
      organizationId: "org-1",
      status: "ready",
      tree: organizationOneTree,
      error: null,
    });
    expect(loadMenus).toHaveBeenCalledTimes(2);
  });

  it("clears the old tree before an organization load and ignores the stale response", async () => {
    const store = createMenuStore();
    await store.getState().loadMenusForOrganization("org-1", async () => organizationOneTree);
    const oldRequest = createDeferred<AuthorizedMenuNode[]>();
    const newRequest = createDeferred<AuthorizedMenuNode[]>();

    const oldLoad = store.getState().loadMenusForOrganization("org-1", () => oldRequest.promise);
    const newLoad = store.getState().loadMenusForOrganization("org-2", () => newRequest.promise);

    expect(store.getState()).toMatchObject({
      organizationId: "org-2",
      status: "loading",
      tree: [],
      byRouteKey: {},
    });

    newRequest.resolve(organizationTwoTree);
    await newLoad;
    oldRequest.resolve(organizationOneTree);
    await oldLoad;

    expect(store.getState()).toMatchObject({
      organizationId: "org-2",
      status: "ready",
      tree: organizationTwoTree,
    });
    expect(store.getState().getAuthorizedRoute("Dashboard")?.id).toBe(3);
    expect(store.getState().getAuthorizedRoute("Members")).toBeUndefined();
  });

  it("invalidates an in-flight request when menus are cleared", async () => {
    const store = createMenuStore();
    const request = createDeferred<AuthorizedMenuNode[]>();
    const loading = store.getState().loadMenusForOrganization("org-1", () => request.promise);

    store.getState().clearMenus();
    request.resolve(organizationOneTree);
    await loading;

    expect(store.getState()).toMatchObject({
      organizationId: null,
      status: "idle",
      tree: [],
      byRouteKey: {},
      error: null,
    });
  });
});
