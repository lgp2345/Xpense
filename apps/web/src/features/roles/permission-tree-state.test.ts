import type { PermissionTreeNode } from "@xpense/shared";
import { describe, expect, it } from "vitest";

import { getPermissionNodeState, togglePermissionNode } from "./permission-tree-state";

const roleButton: PermissionTreeNode = {
  id: 4,
  parentId: 2,
  type: "button",
  name: "编辑角色",
  permissionCode: "roles:update",
  children: [],
};

const childPage: PermissionTreeNode = {
  id: 3,
  parentId: 2,
  type: "menu",
  name: "角色详情",
  permissionCode: "roles:create",
  children: [],
};

const roleMenu: PermissionTreeNode = {
  id: 2,
  parentId: 1,
  type: "menu",
  name: "角色管理",
  permissionCode: "roles:read",
  children: [childPage, roleButton],
};

const systemDirectory: PermissionTreeNode = {
  id: 1,
  parentId: null,
  type: "directory",
  name: "系统管理",
  permissionCode: null,
  children: [roleMenu],
};

const auditPermission: PermissionTreeNode = {
  id: -1,
  parentId: null,
  type: "menu",
  name: "查看审计日志",
  permissionCode: "audit_logs:read",
  children: [],
};

const otherPermissions: PermissionTreeNode = {
  id: null,
  parentId: null,
  type: "directory",
  name: "其他权限",
  permissionCode: null,
  children: [auditPermission],
};

const permissionTree = [systemDirectory, otherPermissions];

describe("permission tree state", () => {
  it("reports a directory as unchecked, indeterminate, or checked from its descendants", () => {
    expect(getPermissionNodeState(systemDirectory, [])).toBe("unchecked");
    expect(getPermissionNodeState(systemDirectory, ["roles:read"])).toBe("indeterminate");
    expect(
      getPermissionNodeState(systemDirectory, ["roles:read", "roles:create", "roles:update"]),
    ).toBe("checked");
  });

  it("selects every descendant when a directory is checked", () => {
    expect(togglePermissionNode(permissionTree, systemDirectory, [], true)).toEqual([
      "roles:create",
      "roles:read",
      "roles:update",
    ]);
  });

  it("selects only the menu permission when a menu is checked", () => {
    expect(togglePermissionNode(permissionTree, roleMenu, [], true)).toEqual(["roles:read"]);
    expect(getPermissionNodeState(roleMenu, ["roles:read"])).toBe("checked");
  });

  it.each([
    ["button", roleButton, ["roles:read", "roles:update"]],
    ["child page", childPage, ["roles:create", "roles:read"]],
  ] as const)("completes permission-bearing ancestors for a %s", (_label, node, expected) => {
    expect(togglePermissionNode(permissionTree, node, [], true)).toEqual(expected);
  });

  it("removes all selected descendants when an ancestor is unchecked", () => {
    expect(
      togglePermissionNode(
        permissionTree,
        roleMenu,
        ["roles:read", "roles:create", "roles:update", "audit_logs:read"],
        false,
      ),
    ).toEqual(["audit_logs:read"]);
  });

  it("supports selecting permissions in the final 其他权限 directory", () => {
    expect(togglePermissionNode(permissionTree, otherPermissions, [], true)).toEqual([
      "audit_logs:read",
    ]);
    expect(getPermissionNodeState(otherPermissions, ["audit_logs:read"])).toBe("checked");
  });
});
