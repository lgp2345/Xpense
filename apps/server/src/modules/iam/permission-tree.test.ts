import type { PermissionKey, PermissionTreeNode } from "@xpense/shared";
import { describe, expect, it } from "vitest";

import type { MenuRow } from "./menu.repository.js";
import {
  buildPermissionTree,
  completePermissionSelection,
  findMissingAncestorPermissions,
  getPermissionNodeState,
} from "./permission-tree.js";

const organizationId = "organization-1";

function menu(
  id: number,
  type: MenuRow["type"],
  permissionCode: PermissionKey | null,
  overrides: Partial<MenuRow> = {},
): MenuRow {
  return {
    id,
    organizationId,
    type,
    name: `节点 ${id}`,
    parentId: null,
    routeKey: type === "menu" ? `Route${id}` : null,
    path: null,
    icon: type === "button" ? null : "Shield",
    permissionCode,
    isExternal: type === "menu" ? false : null,
    isVisible: type === "button" ? null : true,
    keepAlive: type === "menu" ? false : null,
    sortOrder: id,
    ...overrides,
  };
}

const permissions = [
  { key: "members:read" as const, name: "查看成员" },
  { key: "members:create" as const, name: "创建成员" },
  { key: "members:update" as const, name: "更新成员" },
  { key: "transactions:create" as const, name: "创建交易" },
  { key: "audit_logs:read" as const, name: "审计日志" },
];

function flatten(nodes: readonly PermissionTreeNode[]): PermissionTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

describe("permission tree", () => {
  it("globally deduplicates permission codes and chooses visible menu before button and hidden menu", () => {
    const rows = [
      menu(1, "menu", "members:read", { isVisible: false, sortOrder: 1 }),
      menu(2, "button", "members:read", { parentId: 4, sortOrder: 0 }),
      menu(3, "menu", "members:read", { isVisible: true, sortOrder: 99 }),
      menu(4, "menu", "members:update", { isVisible: true, sortOrder: 2 }),
      menu(5, "button", "members:create", { parentId: 4, sortOrder: 20 }),
      menu(6, "button", "members:create", { parentId: 4, sortOrder: 10 }),
    ];

    const result = buildPermissionTree(rows, permissions);
    const permissionNodes = flatten(result).filter((node) => node.permissionCode !== null);

    expect(permissionNodes.filter((node) => node.permissionCode === "members:read")).toEqual([
      expect.objectContaining({ id: 3, type: "menu" }),
    ]);
    expect(permissionNodes.filter((node) => node.permissionCode === "members:create")).toEqual([
      expect.objectContaining({ id: 6, type: "button" }),
    ]);
  });

  it("orders representatives by visible menu, button, hidden menu, then sortOrder", () => {
    const rows = [
      menu(10, "menu", "members:read", { isVisible: false, sortOrder: 1 }),
      menu(11, "menu", "members:read", { isVisible: false, sortOrder: 0 }),
      menu(12, "button", "members:read", { parentId: 20, sortOrder: 50 }),
      menu(20, "menu", "members:update", { isVisible: true }),
    ];

    expect(
      flatten(buildPermissionTree(rows, permissions)).find(
        (node) => node.permissionCode === "members:read",
      ),
    ).toMatchObject({ id: 12, type: "button" });

    const withoutButton = rows.filter((row) => row.id !== 12);
    expect(
      flatten(buildPermissionTree(withoutButton, permissions)).find(
        (node) => node.permissionCode === "members:read",
      ),
    ).toMatchObject({ id: 11, type: "menu" });
  });

  it("chooses the smaller numeric id when priority and sortOrder are equal regardless of input order", () => {
    const smaller = menu(10, "menu", "members:read", { isVisible: false, sortOrder: 7 });
    const larger = menu(20, "menu", "members:read", { isVisible: false, sortOrder: 7 });

    for (const rows of [
      [smaller, larger],
      [larger, smaller],
    ]) {
      expect(
        flatten(buildPermissionTree(rows, permissions)).find(
          (node) => node.permissionCode === "members:read",
        ),
      ).toMatchObject({ id: 10, type: "menu" });
    }
  });

  it("puts unmapped permissions in a final 其他权限 directory with stable key ordering", () => {
    const result = buildPermissionTree(
      [menu(1, "menu", "members:read")],
      [...permissions].reverse(),
    );
    const other = result.at(-1);

    expect(other).toMatchObject({ id: null, parentId: null, type: "directory", name: "其他权限" });
    expect(other?.children.map((node) => node.permissionCode)).toEqual([
      "audit_logs:read",
      "members:create",
      "members:update",
      "transactions:create",
    ]);
    expect(other?.children.every((node) => typeof node.id === "number" && node.id < 0)).toBe(true);
  });

  it("aggregates directory state as unchecked, indeterminate, or checked", () => {
    const tree = buildPermissionTree(
      [
        menu(1, "directory", null),
        menu(2, "menu", "members:read", { parentId: 1 }),
        menu(3, "button", "members:create", { parentId: 2 }),
      ],
      permissions.slice(0, 2),
    );
    const directory = tree[0];

    expect(directory && getPermissionNodeState(directory, [])).toBe("unchecked");
    expect(directory && getPermissionNodeState(directory, ["members:read"])).toBe("indeterminate");
    expect(directory && getPermissionNodeState(directory, ["members:read", "members:create"])).toBe(
      "checked",
    );
  });

  it("automatically completes all permission-bearing ancestors and reports missing ancestors", () => {
    const rows = [
      menu(1, "directory", null),
      menu(2, "menu", "members:read", { parentId: 1 }),
      menu(3, "menu", "members:update", { parentId: 2, isVisible: false }),
      menu(4, "button", "members:create", { parentId: 3 }),
    ];

    expect(completePermissionSelection(rows, ["members:create"])).toEqual([
      "members:create",
      "members:read",
      "members:update",
    ]);
    expect(findMissingAncestorPermissions(rows, ["members:create", "members:update"])).toEqual([
      "members:read",
    ]);
    expect(
      findMissingAncestorPermissions(rows, ["members:create", "members:read", "members:update"]),
    ).toEqual([]);
  });
});
