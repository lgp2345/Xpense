import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildAuthorizedMenuTree,
  findNavigationAncestor,
  getAllowedParentIds,
  isNavigationEligible,
  type MenuTreeNode,
  validateMenuTree,
} from "./menu-tree.js";

const organizationId = "organization-1";
const otherOrganizationId = "organization-2";

function directory(
  id: number,
  parentId: number | null,
  overrides: Partial<MenuTreeNode> = {},
): MenuTreeNode {
  return {
    id,
    organizationId,
    type: "directory",
    parentId,
    name: `目录 ${id}`,
    routeKey: null,
    path: null,
    icon: "Shield",
    permissionCode: null,
    isExternal: null,
    isVisible: true,
    keepAlive: null,
    sortOrder: id,
    ...overrides,
  };
}

function menu(
  id: number,
  parentId: number | null,
  overrides: Partial<MenuTreeNode> = {},
): MenuTreeNode {
  return {
    id,
    organizationId,
    type: "menu",
    parentId,
    name: `菜单 ${id}`,
    routeKey: `Route${id}`,
    path: null,
    icon: "Users",
    permissionCode: `menus:${id}:read`,
    isExternal: false,
    isVisible: true,
    keepAlive: true,
    sortOrder: id,
    ...overrides,
  };
}

function button(id: number, parentId: number, overrides: Partial<MenuTreeNode> = {}): MenuTreeNode {
  return {
    id,
    organizationId,
    type: "button",
    parentId,
    name: `按钮 ${id}`,
    routeKey: null,
    path: null,
    icon: null,
    permissionCode: `menus:${id}:update`,
    isExternal: null,
    isVisible: null,
    keepAlive: null,
    sortOrder: id,
    ...overrides,
  };
}

describe("validateMenuTree", () => {
  it.each([
    {
      name: "允许两级目录下的菜单及其按钮后代",
      nodes: [directory(1, null), directory(2, 1), menu(3, 2), button(4, 3)],
      expected: { ok: true },
    },
    {
      name: "拒绝第三级目录",
      nodes: [directory(1, null), directory(2, 1), directory(3, 2)],
      expected: { ok: false, code: "directory_depth_exceeded", nodeId: 3 },
    },
    {
      name: "拒绝不在菜单下的按钮",
      nodes: [directory(1, null), button(2, 1)],
      expected: { ok: false, code: "button_parent_must_be_menu", nodeId: 2 },
    },
    {
      name: "拒绝不存在的父节点",
      nodes: [menu(1, 99)],
      expected: { ok: false, code: "parent_not_found", nodeId: 1 },
    },
    {
      name: "拒绝以菜单作为目录父节点",
      nodes: [menu(1, null), directory(2, 1)],
      expected: { ok: false, code: "directory_parent_must_be_directory", nodeId: 2 },
    },
    {
      name: "拒绝以按钮作为菜单父节点",
      nodes: [menu(3, 2), button(2, 1), menu(1, null)],
      expected: { ok: false, code: "menu_parent_must_be_directory", nodeId: 3 },
    },
    {
      name: "拒绝拥有子节点的按钮",
      nodes: [menu(1, null), button(2, 1), button(3, 2)],
      expected: { ok: false, code: "button_has_children", nodeId: 2 },
    },
    {
      name: "拒绝拥有子节点的外链菜单",
      nodes: [
        menu(1, null, { isExternal: true, routeKey: null, path: "https://example.com" }),
        button(2, 1),
      ],
      expected: { ok: false, code: "external_not_leaf", nodeId: 1 },
    },
    {
      name: "拒绝父子循环",
      nodes: [directory(1, 2), directory(2, 1)],
      expected: { ok: false, code: "cycle_detected", nodeId: 1 },
    },
    {
      name: "拒绝跨组织父节点",
      nodes: [directory(1, null, { organizationId: otherOrganizationId }), menu(2, 1)],
      expected: { ok: false, code: "cross_organization_parent", nodeId: 2 },
    },
    {
      name: "拒绝可见导航中的参数路由",
      nodes: [menu(1, null, { path: "/members/:id" })],
      expected: { ok: false, code: "parameter_route_visible", nodeId: 1 },
    },
  ])("$name", ({ nodes, expected }) => {
    expect(validateMenuTree(nodes)).toEqual(expected);
  });

  it("拒绝删除仍有子节点的菜单", () => {
    expect(validateMenuTree([directory(1, null), menu(2, 1)], { deletingId: 1 })).toEqual({
      ok: false,
      code: "non_leaf_delete",
      nodeId: 1,
    });
  });
});

describe("getAllowedParentIds", () => {
  it.each([
    {
      name: "目录只能选择第一层目录作为父节点",
      type: "directory" as const,
      expected: [1],
    },
    {
      name: "菜单可以选择任意两层目录",
      type: "menu" as const,
      expected: [1, 2],
    },
    {
      name: "按钮只能选择非外链菜单",
      type: "button" as const,
      expected: [3],
    },
  ])("$name", ({ type, expected }) => {
    const nodes = [
      directory(1, null, { sortOrder: 20 }),
      directory(2, 1, { sortOrder: 10 }),
      menu(3, 2, { sortOrder: 30 }),
      menu(4, null, {
        organizationId: otherOrganizationId,
        isExternal: true,
        routeKey: null,
        path: "https://example.com",
      }),
      directory(10, null, { organizationId: otherOrganizationId }),
      menu(11, null, { organizationId: otherOrganizationId }),
    ];

    expect(getAllowedParentIds(nodes, { organizationId, type })).toEqual(expected);
  });
});

describe("navigation helpers", () => {
  it.each([
    ["可见内部菜单", menu(1, null), true],
    ["隐藏菜单", menu(1, null, { isVisible: false }), false],
    ["参数路由菜单", menu(1, null, { path: "/members/:id" }), false],
    ["目录", directory(1, null), false],
    [
      "可见外链菜单",
      menu(1, null, { isExternal: true, routeKey: null, path: "https://example.com" }),
      true,
    ],
  ] as const)("%s 是%s导航", (_name, node, expected) => {
    expect(isNavigationEligible(node)).toBe(expected);
  });

  it("为按钮找到最近的可见菜单祖先，而不把隐藏菜单当作导航", () => {
    const visibleMenu = menu(2, 1);
    const hiddenMenu = menu(4, 1, { isVisible: false });
    const nodes = [directory(1, null), visibleMenu, button(3, 2), hiddenMenu, button(5, 4)];

    expect(findNavigationAncestor(nodes, 3)).toEqual(visibleMenu);
    expect(findNavigationAncestor(nodes, 5)).toBeNull();
  });
});

describe("buildAuthorizedMenuTree", () => {
  it("在循环目录祖先下有授权菜单时，在受控超时内返回且不泄露循环节点", () => {
    const moduleUrl = pathToFileURL(fileURLToPath(new URL("./menu-tree.ts", import.meta.url))).href;
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `import { buildAuthorizedMenuTree } from ${JSON.stringify(moduleUrl)};
const nodes = [
  { id: 1, organizationId: "organization-1", type: "directory", name: "目录 1", parentId: 2, routeKey: null, path: null, icon: "Shield", permissionCode: null, isExternal: null, isVisible: true, keepAlive: null, sortOrder: 1 },
  { id: 2, organizationId: "organization-1", type: "directory", name: "目录 2", parentId: 1, routeKey: null, path: null, icon: "Shield", permissionCode: null, isExternal: null, isVisible: true, keepAlive: null, sortOrder: 2 },
  { id: 3, organizationId: "organization-1", type: "menu", name: "菜单 3", parentId: 1, routeKey: "Route3", path: null, icon: "Users", permissionCode: "menus:read", isExternal: false, isVisible: true, keepAlive: true, sortOrder: 3 },
];
process.stdout.write(JSON.stringify(buildAuthorizedMenuTree(nodes, { organizationId: "organization-1", permissionCodes: ["menus:read"] }).map((node) => node.id)));`,
      ],
      { encoding: "utf8", timeout: 500 },
    );

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout.trim()).toBe("[]");
  });

  it("保留隐藏目录祖先，移除未授权菜单和所有按钮，并按排序稳定构树", () => {
    const nodes = [
      directory(1, null, { isVisible: false, sortOrder: 20 }),
      menu(2, 1, { permissionCode: "menus:read", sortOrder: 10 }),
      button(3, 2),
      menu(4, 1, { permissionCode: "menus:delete", sortOrder: 20 }),
      menu(5, null, { permissionCode: "menus:read", sortOrder: 10 }),
      directory(6, null, { sortOrder: 5 }),
      menu(7, null, { permissionCode: "menus:read", sortOrder: 10 }),
      menu(8, 6, { permissionCode: "menus:read", path: "/members/:id" }),
      menu(9, null, { organizationId: otherOrganizationId, permissionCode: "menus:read" }),
    ];

    const tree = buildAuthorizedMenuTree(nodes, {
      organizationId,
      permissionCodes: ["menus:read"],
    });

    expect(
      tree.map((node) => ({
        id: node.id,
        visible: node.isVisible,
        children: node.children.map((child) => child.id),
      })),
    ).toEqual([
      { id: 5, visible: true, children: [] },
      { id: 7, visible: true, children: [] },
      { id: 1, visible: false, children: [2] },
    ]);
  });
});
