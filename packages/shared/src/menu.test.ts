import { describe, expect, it } from "vitest";

import type { AuthorizedMenuNode, MenuConfigurationNode } from "./menu.js";
import { menuIconKeys, menuTypes, ROUTE_DEFINITIONS } from "./menu.js";

type Assert<T extends true> = T;
type AuthorizedMenusExcludeButtons = Assert<
  Extract<AuthorizedMenuNode, { type: "button" }> extends never ? true : false
>;

const authorizedMenusExcludeButtons: AuthorizedMenusExcludeButtons = true;

const configurationContract = [
  {
    id: 1,
    parentId: null,
    type: "directory",
    name: "系统管理",
    icon: "Shield",
    isVisible: true,
    routeKey: null,
    path: null,
    url: null,
    permissionCode: null,
    isExternal: null,
    keepAlive: null,
    sortOrder: 0,
    children: [],
  },
  {
    id: 2,
    parentId: 1,
    type: "menu",
    name: "菜单管理",
    icon: "ShieldCheck",
    isVisible: true,
    routeKey: "Menus",
    path: "/menus",
    url: null,
    permissionCode: "menus:read",
    isExternal: false,
    keepAlive: false,
    sortOrder: 0,
    children: [],
  },
  {
    id: 3,
    parentId: 2,
    type: "button",
    name: "新增菜单",
    icon: null,
    isVisible: null,
    routeKey: null,
    path: null,
    url: null,
    permissionCode: "menus:create",
    isExternal: null,
    keepAlive: null,
    sortOrder: 0,
    children: [],
  },
] satisfies MenuConfigurationNode[];

describe("organization menu shared contract", () => {
  it("declares every statically registered internal route without Web components", () => {
    expect(Object.keys(ROUTE_DEFINITIONS)).toEqual([
      "Dashboard",
      "Members",
      "Roles",
      "Sessions",
      "AuditLogs",
      "Menus",
    ]);
    expect(ROUTE_DEFINITIONS.Menus.path).toBe("/menus");
  });

  it("keeps menu types and icon keys stable across clients", () => {
    expect(menuTypes).toEqual(["directory", "menu", "button"]);
    expect(menuIconKeys).toEqual([
      "LayoutDashboard",
      "MonitorSmartphone",
      "ScrollText",
      "Shield",
      "ShieldCheck",
      "Users",
    ]);
  });

  it("uses numeric menu identifiers and a type-discriminated configuration tree", () => {
    const firstNode = configurationContract[0];

    expect(firstNode).toMatchObject({ id: 1, parentId: null });
    expect(authorizedMenusExcludeButtons).toBe(true);
  });
});
