import type { PermissionKey } from "./rbac.js";

export const ROUTE_DEFINITIONS = {
  Dashboard: { path: "/" },
  Members: { path: "/members" },
  Roles: { path: "/roles" },
  Sessions: { path: "/sessions" },
  AuditLogs: { path: "/audit-logs" },
  Menus: { path: "/menus" },
} as const;

export type RouteKey = keyof typeof ROUTE_DEFINITIONS;

export const menuTypes = ["directory", "menu", "button"] as const;

export type MenuType = (typeof menuTypes)[number];

export const menuIconKeys = [
  "LayoutDashboard",
  "MonitorSmartphone",
  "ScrollText",
  "Shield",
  "ShieldCheck",
  "Users",
] as const;

export type MenuIconKey = (typeof menuIconKeys)[number];

type MenuNodeBase = {
  id: number;
  parentId: number | null;
  name: string;
  sortOrder: number;
};

type MenuDirectoryNode = MenuNodeBase & {
  type: "directory";
  icon: MenuIconKey | null;
  isVisible: boolean;
  routeKey: null;
  path: null;
  url: null;
  permissionCode: null;
  isExternal: null;
  keepAlive: null;
  children: MenuConfigurationNode[];
};

type InternalMenuNode = {
  [Key in RouteKey]: MenuNodeBase & {
    type: "menu";
    icon: MenuIconKey | null;
    isVisible: boolean;
    routeKey: Key;
    path: (typeof ROUTE_DEFINITIONS)[Key]["path"];
    url: null;
    permissionCode: PermissionKey;
    isExternal: false;
    keepAlive: boolean;
    children: MenuConfigurationNode[];
  };
}[RouteKey];

type ExternalMenuNode = MenuNodeBase & {
  type: "menu";
  icon: MenuIconKey | null;
  isVisible: boolean;
  routeKey: null;
  path: null;
  url: string;
  permissionCode: PermissionKey;
  isExternal: true;
  keepAlive: null;
  children: MenuConfigurationNode[];
};

type MenuButtonNode = MenuNodeBase & {
  type: "button";
  icon: null;
  isVisible: null;
  routeKey: null;
  path: null;
  url: null;
  permissionCode: PermissionKey;
  isExternal: null;
  keepAlive: null;
  children: MenuConfigurationNode[];
};

export type MenuConfigurationNode =
  | MenuDirectoryNode
  | InternalMenuNode
  | ExternalMenuNode
  | MenuButtonNode;

export type AuthorizedMenuNode =
  | (Omit<MenuDirectoryNode, "children"> & { children: AuthorizedMenuNode[] })
  | (Omit<InternalMenuNode, "children"> & { children: AuthorizedMenuNode[] })
  | (Omit<ExternalMenuNode, "children"> & { children: AuthorizedMenuNode[] });

export type PermissionTreeNode =
  | {
      id: number | null;
      parentId: number | null;
      type: "directory";
      name: string;
      permissionCode: null;
      children: PermissionTreeNode[];
    }
  | {
      id: number;
      parentId: number | null;
      type: "menu" | "button";
      name: string;
      permissionCode: PermissionKey;
      children: PermissionTreeNode[];
    };
