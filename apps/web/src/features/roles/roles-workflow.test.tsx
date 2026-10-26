import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizedMenuNode, PermissionKey, PermissionTreeNode } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { IamApi, IamRoleWithPermissions } from "../../services/iam-api";
import { RolesPage } from "./roles-page";

const systemRole: IamRoleWithPermissions = {
  id: "role-owner",
  organizationId: null,
  key: "owner",
  name: "所有者",
  description: "拥有全部管理权限",
  isSystem: true,
  isEditable: false,
  permissionKeys: ["roles:read"],
};

const customRole: IamRoleWithPermissions = {
  id: "role-rental-manager",
  organizationId: "org-1",
  key: "rental-manager",
  name: "租务管理员",
  description: "管理租赁业务",
  isSystem: false,
  isEditable: true,
  permissionKeys: ["roles:read"],
};

const permissionTree: PermissionTreeNode[] = [
  {
    id: 1,
    parentId: null,
    type: "directory",
    name: "组织管理",
    permissionCode: null,
    children: [
      {
        id: 2,
        parentId: 1,
        type: "menu",
        name: "查看角色",
        permissionCode: "roles:read",
        children: [
          {
            id: 3,
            parentId: 2,
            type: "button",
            name: "更新角色",
            permissionCode: "roles:update",
            children: [],
          },
        ],
      },
      {
        id: 4,
        parentId: 1,
        type: "menu",
        name: "查看成员",
        permissionCode: "members:read",
        children: [],
      },
    ],
  },
  {
    id: null,
    parentId: null,
    type: "directory",
    name: "其他权限",
    permissionCode: null,
    children: [
      {
        id: -1,
        parentId: null,
        type: "menu",
        name: "查看审计日志",
        permissionCode: "audit_logs:read",
        children: [],
      },
    ],
  },
];

type RolesApi = Pick<
  IamApi,
  | "listRoles"
  | "getRoleMenus"
  | "createRole"
  | "deleteRole"
  | "getPermissionTree"
  | "editRole"
  | "editRolePermissions"
>;

function createIamApi(overrides: Partial<RolesApi> = {}): RolesApi {
  return {
    listRoles: vi.fn().mockResolvedValue([systemRole, customRole]),
    getRoleMenus: vi.fn().mockResolvedValue([]),
    createRole: vi.fn().mockResolvedValue(customRole),
    deleteRole: vi.fn().mockResolvedValue(undefined),
    getPermissionTree: vi.fn().mockResolvedValue(permissionTree),
    editRole: vi.fn().mockResolvedValue(customRole),
    editRolePermissions: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderRolesPage(
  permissions: PermissionKey[],
  options: {
    api?: RolesApi;
    pagePermissionTree?: PermissionTreeNode[];
    roles?: IamRoleWithPermissions[];
  } = {},
) {
  render(
    <RolesPage
      api={options.api}
      permissions={permissions}
      roleItems={options.roles ?? [systemRole, customRole]}
      permissionTreeItems={options.pagePermissionTree ?? permissionTree}
    />,
  );
}

function getOtherPermissionTree(): PermissionTreeNode {
  const node = permissionTree.find((item) => item.name === "其他权限");

  if (!node) {
    throw new Error("其他权限 fixture is required");
  }

  return node;
}

describe("RolesPage", () => {
  it.each([
    systemRole,
    customRole,
  ])("shows read-only menus for $name with only roles:read", async (role) => {
    const user = userEvent.setup();
    const menus: AuthorizedMenuNode[] = [
      {
        id: 1,
        parentId: null,
        name: "组织管理",
        sortOrder: 1,
        type: "directory",
        icon: null,
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
            name: "角色管理",
            sortOrder: 1,
            type: "menu",
            icon: null,
            isVisible: true,
            routeKey: "Roles",
            path: "/roles",
            url: null,
            permissionCode: "roles:read",
            isExternal: false,
            keepAlive: false,
            children: [],
          },
        ],
      },
    ];
    const api = createIamApi({ getRoleMenus: vi.fn().mockResolvedValue(menus) });
    renderRolesPage(["roles:read"], { api });

    expect(api.getRoleMenus).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: `查看 ${role.name} 的菜单` }));

    const dialog = await screen.findByRole("dialog", { name: `${role.name}的菜单` });
    expect(await within(dialog).findByText("组织管理")).toBeInTheDocument();
    expect(within(dialog).getByText("角色管理")).toBeInTheDocument();
    expect(within(dialog).getByText("/roles")).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /保存/ })).not.toBeInTheDocument();
    expect(api.getRoleMenus).toHaveBeenCalledWith(role.id);
    expect(api.getPermissionTree).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows an empty state when the role has no visible menus", async () => {
    const user = userEvent.setup();
    renderRolesPage(["roles:read"], { api: createIamApi() });
    await user.click(screen.getByRole("button", { name: "查看 租务管理员 的菜单" }));
    expect(await screen.findByText("该角色暂无可见菜单。")).toBeInTheDocument();
  });

  it("shows loading and lets users retry a failed menu request", async () => {
    const user = userEvent.setup();
    let rejectRequest: (error: Error) => void = () => {};
    const api = createIamApi({
      getRoleMenus: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              rejectRequest = reject;
            }),
        )
        .mockResolvedValue([]),
    });
    renderRolesPage(["roles:read"], { api });
    await user.click(screen.getByRole("button", { name: "查看 所有者 的菜单" }));
    expect(screen.getByRole("status")).toHaveTextContent("正在加载菜单...");
    rejectRequest(new Error("internal-detail"));
    expect(await screen.findByRole("alert")).toHaveTextContent("加载角色菜单失败，请稍后重试。");
    expect(screen.queryByText("internal-detail")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("该角色暂无可见菜单。")).toBeInTheDocument();
    expect(api.getRoleMenus).toHaveBeenCalledTimes(2);
  });

  it("loads the role list without requesting the permission tree when permission updates are unavailable", async () => {
    const api = createIamApi({
      getPermissionTree: vi.fn().mockRejectedValue(new Error("forbidden")),
    });

    render(<RolesPage api={api} permissions={["roles:read"]} />);

    expect(await screen.findByText("租务管理员")).toBeInTheDocument();
    expect(api.listRoles).toHaveBeenCalledTimes(1);
    expect(api.getPermissionTree).not.toHaveBeenCalled();
  });

  it("does not offer edit or delete actions for a non-editable system role", () => {
    renderRolesPage(["roles:read", "roles:update", "roles:delete"]);

    expect(screen.queryByRole("button", { name: "编辑 所有者" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 所有者" })).not.toBeInTheDocument();
  });

  it("reports role creation validation errors before requesting the API", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles:read", "roles:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增角色" }));
    await user.click(screen.getByRole("button", { name: "创建角色" }));

    expect(screen.getByText("请输入角色标识")).toBeInTheDocument();
    expect(screen.getByText("请输入角色名称")).toBeInTheDocument();
    expect(api.createRole).not.toHaveBeenCalled();
  });

  it("renders a mixed directory and submits a tree selection when creating", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles:read", "roles:create", "roles:permissions:update"], { api });

    await user.click(screen.getByRole("button", { name: "新增角色" }));
    await user.type(screen.getByRole("textbox", { name: "角色标识" }), "  Rental Manager  ");
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "租务管理员");
    await user.click(screen.getByRole("checkbox", { name: "查看成员" }));

    expect(screen.getByRole("checkbox", { name: "组织管理" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
    const organizationItem = screen.getByRole("checkbox", { name: "组织管理" }).closest("li");

    if (!organizationItem) {
      throw new Error("组织管理 list item is required");
    }

    expect(
      within(organizationItem).getByRole("list", {
        name: "组织管理的子权限",
      }),
    ).toContainElement(screen.getByRole("checkbox", { name: "查看成员" }));

    await user.click(screen.getByRole("button", { name: "创建角色" }));

    await waitFor(() =>
      expect(api.createRole).toHaveBeenCalledWith({
        key: "rental-manager",
        name: "租务管理员",
        description: "",
        permissionKeys: ["members:read"],
      }),
    );
  });

  it("preserves an existing hidden permission chain when saving without visible changes", async () => {
    const user = userEvent.setup();
    const protectedPermissionKeys = ["menus:read", "roles:read", "roles:update"] as PermissionKey[];
    let persistedPermissionKeys = protectedPermissionKeys;
    const api = createIamApi({
      editRolePermissions: vi.fn().mockImplementation(async ({ permissionKeys }) => {
        persistedPermissionKeys = [...new Set([...protectedPermissionKeys, ...permissionKeys])];
      }),
    });
    const roleWithProtectedPermissions = {
      ...customRole,
      permissionKeys: protectedPermissionKeys,
    };

    renderRolesPage(["roles:permissions:update", "roles:update"], {
      api,
      pagePermissionTree: [getOtherPermissionTree()],
      roles: [roleWithProtectedPermissions],
    });

    await user.click(screen.getByRole("button", { name: "编辑 租务管理员" }));

    expect(screen.queryByText("roles:update")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    await waitFor(() =>
      expect(api.editRolePermissions).toHaveBeenCalledWith({
        roleId: "role-rental-manager",
        permissionKeys: [],
      }),
    );
    expect(persistedPermissionKeys).toEqual(protectedPermissionKeys);
  });

  it("preserves hidden existing permissions while changing a visible permission", async () => {
    const user = userEvent.setup();
    const protectedPermissionKeys = ["menus:read", "roles:read", "roles:update"] as PermissionKey[];
    let persistedPermissionKeys = protectedPermissionKeys;
    const api = createIamApi({
      editRolePermissions: vi.fn().mockImplementation(async ({ permissionKeys }) => {
        persistedPermissionKeys = [...new Set([...protectedPermissionKeys, ...permissionKeys])];
      }),
    });

    renderRolesPage(["roles:permissions:update", "roles:update", "audit_logs:read"], {
      api,
      pagePermissionTree: [getOtherPermissionTree()],
      roles: [{ ...customRole, permissionKeys: protectedPermissionKeys }],
    });

    await user.click(screen.getByRole("button", { name: "编辑 租务管理员" }));
    await user.click(screen.getByRole("checkbox", { name: "查看审计日志" }));
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    await waitFor(() =>
      expect(api.editRolePermissions).toHaveBeenCalledWith({
        roleId: "role-rental-manager",
        permissionKeys: ["audit_logs:read"],
      }),
    );
    expect(persistedPermissionKeys).toEqual([
      "menus:read",
      "roles:read",
      "roles:update",
      "audit_logs:read",
    ]);
  });

  it("keeps the editor open and preserves values when creating a role fails", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      createRole: vi.fn().mockRejectedValue(new Error("authorization=secret")),
    });
    renderRolesPage(["roles:read", "roles:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增角色" }));
    await user.type(screen.getByRole("textbox", { name: "角色标识" }), "rental-manager");
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "租务管理员");
    await user.click(screen.getByRole("button", { name: "创建角色" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("新增角色失败，请稍后重试。");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "角色名称" })).toHaveValue("租务管理员");
    expect(screen.queryByText(/authorization=secret/i)).not.toBeInTheDocument();
  });

  it("asks for confirmation before deleting an editable role", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles:read", "roles:delete"], { api });

    await user.click(screen.getByRole("button", { name: "删除 租务管理员" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("确认删除角色");
    expect(api.deleteRole).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(api.deleteRole).toHaveBeenCalledWith("role-rental-manager"));
  });

  it("saves basic information and manageable permissions through separate action requests", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles:read", "roles:update", "roles:permissions:update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 租务管理员" }));
    await user.clear(screen.getByRole("textbox", { name: "角色名称" }));
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "租务主管");
    await user.click(screen.getByRole("checkbox", { name: "查看成员" }));
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    await waitFor(() =>
      expect(api.editRole).toHaveBeenCalledWith({
        roleId: "role-rental-manager",
        name: "租务主管",
        description: "管理租赁业务",
      }),
    );
    expect(api.editRolePermissions).toHaveBeenCalledWith({
      roleId: "role-rental-manager",
      permissionKeys: ["members:read", "roles:read"],
    });
  });

  it("allows permission-only editors to open the dialog and only save permissions", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles:read", "roles:permissions:update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 租务管理员" }));

    expect(screen.getByRole("textbox", { name: "角色名称" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "角色说明" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "查看成员" }));
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    await waitFor(() =>
      expect(api.editRolePermissions).toHaveBeenCalledWith({
        roleId: "role-rental-manager",
        permissionKeys: ["members:read", "roles:read"],
      }),
    );
    expect(api.editRole).not.toHaveBeenCalled();
  });

  it("allows metadata-only editors to save details without exposing an editable tree", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles:read", "roles:update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 租务管理员" }));
    await user.clear(screen.getByRole("textbox", { name: "角色名称" }));
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "租务主管");

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    await waitFor(() => expect(api.editRole).toHaveBeenCalledTimes(1));
    expect(api.editRolePermissions).not.toHaveBeenCalled();
  });

  it("reports a basic-information failure and does not attempt the permission request", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      editRole: vi.fn().mockRejectedValue(new Error("network")),
    });
    renderRolesPage(["roles:read", "roles:update", "roles:permissions:update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 租务管理员" }));
    await user.clear(screen.getByRole("textbox", { name: "角色名称" }));
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "失败后保留");
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "角色基本信息保存失败，请稍后重试。",
    );
    expect(api.editRolePermissions).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "角色名称" })).toHaveValue("失败后保留");
  });

  it("reports a permission failure after basic information has been saved", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      editRolePermissions: vi.fn().mockRejectedValue(new Error("network")),
    });
    renderRolesPage(["roles:read", "roles:update", "roles:permissions:update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 租务管理员" }));
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "角色基本信息已保存，但权限保存失败，请稍后重试。",
    );
    expect(api.editRole).toHaveBeenCalledTimes(1);
    expect(api.editRolePermissions).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("reopens an editor with the latest role data after a successful update", async () => {
    const user = userEvent.setup();
    const updatedRole = { ...customRole, name: "租务主管", description: "更新后的职责" };
    const api = createIamApi({
      listRoles: vi.fn().mockResolvedValue([systemRole, updatedRole]),
      editRole: vi.fn().mockResolvedValue(customRole),
    });
    renderRolesPage(["roles:read", "roles:update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 租务管理员" }));
    await user.clear(screen.getByRole("textbox", { name: "角色名称" }));
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "租务主管");
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "编辑 租务主管" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "编辑 租务主管" }));

    expect(screen.getByRole("textbox", { name: "角色名称" })).toHaveValue("租务主管");
    expect(screen.getByRole("textbox", { name: "角色说明" })).toHaveValue("更新后的职责");
  });

  it("closes the editor after a successful update even when refreshing roles fails", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      listRoles: vi.fn().mockRejectedValue(new Error("network")),
      editRole: vi.fn().mockResolvedValue(customRole),
    });
    renderRolesPage(["roles:read", "roles:update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 租务管理员" }));
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "角色已更新，但刷新列表失败，请稍后重试。",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
