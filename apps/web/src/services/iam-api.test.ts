import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "./api-client";
import { createIamApi } from "./iam-api";

describe("createIamApi", () => {
  function createHarness() {
    const client = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    };

    return { api: createIamApi(client as unknown as ApiClient), client };
  }

  it("wraps member and role endpoints without organization id", async () => {
    const { api, client } = createHarness();

    await api.listMembers();
    await api.createMember({ userId: "user-1", roleId: "role-1" });
    await api.updateMember("member-1", { status: "disabled" });
    await api.listRoles();
    await api.createRole({ key: "bookkeeper", name: "Bookkeeper", permissionKeys: [] });
    await api.updateRole("role-1", { permissionKeys: ["roles:read"] });
    await api.deleteRole("role-1");
    await api.listPermissions();

    expect(client.get).toHaveBeenNthCalledWith(1, "/members/list");
    expect(client.post).toHaveBeenNthCalledWith(1, "/members/create", {
      userId: "user-1",
      roleId: "role-1",
    });
    expect(client.post).toHaveBeenNthCalledWith(2, "/members/update", {
      id: "member-1",
      status: "disabled",
    });
    expect(client.get).toHaveBeenNthCalledWith(2, "/roles/list");
    expect(client.post).toHaveBeenNthCalledWith(3, "/roles/create", {
      key: "bookkeeper",
      name: "Bookkeeper",
      permissionKeys: [],
    });
    expect(client.post).toHaveBeenNthCalledWith(4, "/roles/update", {
      id: "role-1",
      permissionKeys: ["roles:read"],
    });
    expect(client.post).toHaveBeenNthCalledWith(5, "/roles/delete", { id: "role-1" });
    expect(client.get).toHaveBeenNthCalledWith(3, "/permissions/list");
  });

  it("wraps audit query filters as query parameters", async () => {
    const { api, client } = createHarness();

    await api.listAuditLogs({
      action: "member.role.changed",
      actorUserId: "user-1",
      targetType: "member",
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-10T00:00:00.000Z"),
      page: 2,
      pageSize: 25,
    });

    expect(client.get).toHaveBeenCalledWith(
      "/audit-logs/list?action=member.role.changed&actorUserId=user-1&targetType=member&from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-10T00%3A00%3A00.000Z&page=2&pageSize=25",
    );
  });

  it("wraps menu and permission-tree endpoints with action paths and request bodies", async () => {
    const { api, client } = createHarness();

    await api.getAuthorizedMenus();
    await api.resolveMenuRoute("/members/42");
    await api.getMenuConfiguration();
    await api.addMenu({
      type: "menu",
      name: "成员",
      parentId: 1,
      routeKey: "Members",
      icon: "Users",
      permissionCode: "members:read",
      isExternal: false,
      isVisible: true,
      keepAlive: false,
    });
    await api.editMenu({
      id: 2,
      type: "directory",
      name: "系统管理",
      parentId: null,
      icon: "Shield",
      isVisible: false,
    });
    await api.deleteMenu(3);
    await api.editMenuOrder(4, "down");
    await api.getPermissionTree();
    await api.editRole({ roleId: "role-1", name: "管理员" });
    await api.editRolePermissions({
      roleId: "role-1",
      permissionKeys: ["members:read", "roles:read"],
    });
    await api.resetOrganizationMenus("00000000-0000-4000-8000-000000000001");

    expect(client.get).toHaveBeenNthCalledWith(1, "/menus", { retry: false });
    expect(client.get).toHaveBeenNthCalledWith(2, "/menus/resolve?path=%2Fmembers%2F42");
    expect(client.get).toHaveBeenNthCalledWith(3, "/menus/configuration");
    expect(client.post).toHaveBeenNthCalledWith(1, "/menus/add", {
      type: "menu",
      name: "成员",
      parentId: 1,
      routeKey: "Members",
      icon: "Users",
      permissionCode: "members:read",
      isExternal: false,
      isVisible: true,
      keepAlive: false,
    });
    expect(client.post).toHaveBeenNthCalledWith(2, "/menus/edit", {
      id: 2,
      type: "directory",
      name: "系统管理",
      parentId: null,
      icon: "Shield",
      isVisible: false,
    });
    expect(client.post).toHaveBeenNthCalledWith(3, "/menus/delete", { id: 3 });
    expect(client.post).toHaveBeenNthCalledWith(4, "/menus/edit-order", {
      id: 4,
      direction: "down",
    });
    expect(client.get).toHaveBeenNthCalledWith(4, "/permissions/tree");
    expect(client.post).toHaveBeenNthCalledWith(5, "/roles/update", {
      id: "role-1",
      name: "管理员",
      description: undefined,
    });
    expect(client.post).toHaveBeenNthCalledWith(6, "/roles/permissions/edit", {
      roleId: "role-1",
      permissionKeys: ["members:read", "roles:read"],
    });
    expect(client.post).toHaveBeenNthCalledWith(7, "/organizations/menus/reset", {
      organizationId: "00000000-0000-4000-8000-000000000001",
    });
  });
});
