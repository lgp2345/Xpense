import {
  type AuthorizedMenuNode,
  type MenuIconKey,
  menuIconKeys,
  ROUTE_DEFINITIONS,
  type RouteKey,
} from "@xpense/shared";
import {
  LayoutDashboard,
  type LucideIcon,
  MonitorSmartphone,
  ScrollText,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import { describe, expect, it } from "vitest";

import {
  buildCommandItems,
  buildNavigationGroups,
  findHighlightedMenuId,
  type MenuNavigationGroup,
} from "./menu-navigation";

const tree: AuthorizedMenuNode[] = [
  {
    id: 1,
    parentId: null,
    type: "menu",
    name: "仪表盘",
    sortOrder: 0,
    icon: null,
    isVisible: true,
    routeKey: "Dashboard",
    path: "/members" as "/",
    url: null,
    permissionCode: "dashboard:read",
    isExternal: false,
    keepAlive: true,
    children: [
      {
        id: 2,
        parentId: 1,
        type: "menu",
        name: "仪表盘详情",
        sortOrder: 0,
        icon: "Users",
        isVisible: false,
        routeKey: "Members",
        path: "/members",
        url: null,
        permissionCode: "members:read",
        isExternal: false,
        keepAlive: false,
        children: [
          {
            id: 8,
            parentId: 2,
            type: "menu",
            name: "菜单管理",
            sortOrder: 0,
            icon: "Shield",
            isVisible: true,
            routeKey: "Menus",
            path: "/menus",
            url: null,
            permissionCode: "menus:read",
            isExternal: false,
            keepAlive: false,
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 10,
    parentId: null,
    type: "directory",
    name: "访问控制",
    sortOrder: 10,
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
        id: 12,
        parentId: 10,
        type: "directory",
        name: "安全",
        sortOrder: 0,
        icon: "Shield",
        isVisible: true,
        routeKey: null,
        path: null,
        url: null,
        permissionCode: null,
        isExternal: null,
        keepAlive: null,
        children: [
          {
            id: 13,
            parentId: 12,
            type: "menu",
            name: "会话管理",
            sortOrder: 0,
            icon: "MonitorSmartphone",
            isVisible: true,
            routeKey: "Sessions",
            path: "/sessions",
            url: null,
            permissionCode: "sessions:read",
            isExternal: false,
            keepAlive: true,
            children: [],
          },
        ],
      },
      {
        id: 11,
        parentId: 10,
        type: "menu",
        name: "角色管理",
        sortOrder: 10,
        icon: "ShieldCheck",
        isVisible: true,
        routeKey: "Roles",
        path: "/roles",
        url: null,
        permissionCode: "roles:read",
        isExternal: false,
        keepAlive: true,
        children: [],
      },
    ],
  },
  {
    id: 20,
    parentId: null,
    type: "directory",
    name: "隐藏目录",
    sortOrder: 20,
    icon: "Shield",
    isVisible: false,
    routeKey: null,
    path: null,
    url: null,
    permissionCode: null,
    isExternal: null,
    keepAlive: null,
    children: [
      {
        id: 21,
        parentId: 20,
        type: "menu",
        name: "审计日志",
        sortOrder: 0,
        icon: "ScrollText",
        isVisible: true,
        routeKey: "AuditLogs",
        path: "/audit-logs",
        url: null,
        permissionCode: "audit_logs:read",
        isExternal: false,
        keepAlive: true,
        children: [],
      },
      {
        id: 22,
        parentId: 20,
        type: "menu",
        name: "外部文档",
        sortOrder: 10,
        icon: "Shield",
        isVisible: true,
        routeKey: null,
        path: null,
        url: "https://docs.example.com",
        permissionCode: "menus:read",
        isExternal: true,
        keepAlive: null,
        children: [],
      },
    ],
  },
];

describe("menu navigation projection", () => {
  it("projects root menus and two directory levels while excluding menu descendants", () => {
    const groups = buildNavigationGroups(tree);

    expect(groups.map(({ title }) => title)).toEqual(["仪表盘", "访问控制"]);
    expect(groups[1]).toMatchObject({
      id: 10,
      title: "访问控制",
      entries: [
        {
          kind: "directory",
          id: 12,
          title: "安全",
          items: [expect.objectContaining({ id: 13, title: "会话管理" })],
        },
        expect.objectContaining({ kind: "menu", id: 11, title: "角色管理" }),
      ],
    });
    expect(getNavigationItems(groups).find((item) => item.id === 1)).toMatchObject({
      href: "/",
      icon: LayoutDashboard,
      isExternal: false,
    });
    expect(getNavigationItems(groups)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 2 }),
        expect.objectContaining({ id: 8 }),
      ]),
    );
  });

  it("excludes every navigation descendant of a hidden directory ancestor", () => {
    const groups = buildNavigationGroups(tree);
    const commandItems = buildCommandItems(tree).flatMap((group) => group.items);

    expect(groups).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 20 })]));
    expect(getNavigationItems(groups)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 21 }),
        expect.objectContaining({ id: 22 }),
      ]),
    );
    expect(commandItems).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 21 }),
        expect.objectContaining({ id: 22 }),
      ]),
    );
  });

  it("builds command items from the same visible pages and preserves safe external metadata", () => {
    const items = buildCommandItems(tree).flatMap((group) => group.items);

    expect(items.map((item) => item.title)).toEqual(["仪表盘", "会话管理", "角色管理"]);
  });

  it("highlights the nearest visible menu ancestor and falls back to no highlight", () => {
    expect(findHighlightedMenuId(tree, "Members")).toBe(1);
    expect(findHighlightedMenuId(tree, "Menus")).toBe(1);
    expect(findHighlightedMenuId(tree, "Sessions")).toBe(13);
    expect(findHighlightedMenuId(tree, "AuditLogs")).toBeNull();
    expect(findHighlightedMenuId(tree, undefined)).toBeNull();
  });

  it("resolves every MenuIconKey through the exhaustive icon record", () => {
    const iconByKey = {
      LayoutDashboard,
      MonitorSmartphone,
      ScrollText,
      Shield,
      ShieldCheck,
      Users,
    } satisfies Record<MenuIconKey, LucideIcon>;
    const routeKeys: RouteKey[] = [
      "Dashboard",
      "Members",
      "Roles",
      "Sessions",
      "AuditLogs",
      "Menus",
    ];
    const iconTree = menuIconKeys.map((icon, index) =>
      createInternalMenu(index + 100, routeKeys[index] as RouteKey, icon),
    );
    const items = getNavigationItems(buildNavigationGroups(iconTree));

    expect(items.map((item) => item.icon)).toEqual(menuIconKeys.map((key) => iconByKey[key]));
  });
});

function createInternalMenu(id: number, routeKey: RouteKey, icon: MenuIconKey): AuthorizedMenuNode {
  return {
    id,
    parentId: null,
    type: "menu",
    name: `${routeKey} menu`,
    sortOrder: id,
    icon,
    isVisible: true,
    routeKey,
    path: ROUTE_DEFINITIONS[routeKey].path,
    url: null,
    permissionCode: "menus:read",
    isExternal: false,
    keepAlive: false,
    children: [],
  } as AuthorizedMenuNode;
}

function getNavigationItems(groups: MenuNavigationGroup[]) {
  return groups.flatMap((group) =>
    group.entries.flatMap((entry) => (entry.kind === "menu" ? [entry] : entry.items)),
  );
}
