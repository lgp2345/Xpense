import { describe, expect, it } from "vitest";

import type { AuthorizedMenuNode, MenuConfigurationNode } from "./menu.js";
import { menuIconKeys, menuTypes, ROUTE_DEFINITIONS } from "./menu.js";

type Assert<T extends true> = T;
type AuthorizedMenusExcludeButtons = Assert<
  Extract<AuthorizedMenuNode, { type: "button" }> extends never ? true : false
>;

const authorizedMenusExcludeButtons: AuthorizedMenusExcludeButtons = true;

const authorizedInternalMenu: AuthorizedMenuNode = {
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
};

// @ts-expect-error Authorized internal menu paths must be derived from their routeKey.
const mismatchedAuthorizedInternalMenu: AuthorizedMenuNode = {
  id: 3,
  parentId: 1,
  type: "menu",
  name: "错误路由",
  icon: "ShieldCheck",
  isVisible: true,
  routeKey: "Dashboard",
  path: "/menus",
  url: null,
  permissionCode: "menus:read",
  isExternal: false,
  keepAlive: false,
  sortOrder: 1,
  children: [],
};

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
      "Transactions",
      "Accounts",
      "Categories",
      "RentalProperties",
      "RentalPropertyDetail",
      "RentalTenants",
      "RentalTenantDetail",
      "RentalContracts",
      "RentalContractDetail",
      "RentalContractCreate",
    ]);
    expect(ROUTE_DEFINITIONS.Menus.path).toBe("/menus");
    expect(ROUTE_DEFINITIONS.Transactions.path).toBe("/transactions");
    expect(ROUTE_DEFINITIONS.Accounts.path).toBe("/accounts");
    expect(ROUTE_DEFINITIONS.Categories.path).toBe("/categories");
    expect(ROUTE_DEFINITIONS.RentalProperties.path).toBe("/rentals/properties");
    expect(ROUTE_DEFINITIONS.RentalPropertyDetail.path).toBe("/rentals/properties/$propertyId");
    expect(ROUTE_DEFINITIONS.RentalTenants.path).toBe("/rentals/tenants");
    expect(ROUTE_DEFINITIONS.RentalTenantDetail.path).toBe("/rentals/tenants/$tenantId");
    expect(ROUTE_DEFINITIONS.RentalContracts.path).toBe("/rentals/contracts");
    expect(ROUTE_DEFINITIONS.RentalContractDetail.path).toBe("/rentals/contracts/$contractId");
    expect(ROUTE_DEFINITIONS.RentalContractCreate.path).toBe("/rentals/contracts/new");
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
      "ReceiptText",
      "WalletCards",
      "Shapes",
      "Building2",
    ]);
  });

  it("uses numeric menu identifiers and a type-discriminated configuration tree", () => {
    const firstNode = configurationContract[0];

    expect(firstNode).toMatchObject({ id: 1, parentId: null });
    expect(authorizedMenusExcludeButtons).toBe(true);
    expect(authorizedInternalMenu.path).toBe("/menus");
    expect(mismatchedAuthorizedInternalMenu.path).toBe("/menus");
  });
});
