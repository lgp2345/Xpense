import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { IamApi, IamPermission, IamRoleWithPermissions } from "../../services/iam-api";
import { RolesPage } from "./roles-page";

const systemRole: IamRoleWithPermissions = {
  id: "role-owner",
  organizationId: null,
  key: "owner",
  name: "所有者",
  description: "拥有全部管理权限",
  isSystem: true,
  isEditable: false,
  permissionKeys: ["roles.read"],
};

const customRole: IamRoleWithPermissions = {
  id: "role-bookkeeper",
  organizationId: "org-1",
  key: "bookkeeper",
  name: "账务管理员",
  description: "管理账本",
  isSystem: false,
  isEditable: true,
  permissionKeys: ["roles.read"],
};

const availablePermissions: IamPermission[] = [
  {
    id: "permission-roles-read",
    key: "roles.read",
    name: "查看角色",
    resource: "roles",
    action: "read",
    description: "查看角色列表",
  },
  {
    id: "permission-members-read",
    key: "members.read",
    name: "查看成员",
    resource: "members",
    action: "read",
    description: "查看成员列表",
  },
];

type RolesApi = Pick<
  IamApi,
  "listRoles" | "createRole" | "updateRole" | "deleteRole" | "listPermissions"
>;

function createIamApi(overrides: Partial<RolesApi> = {}): RolesApi {
  return {
    listRoles: vi.fn().mockResolvedValue([systemRole, customRole]),
    createRole: vi.fn().mockResolvedValue(customRole),
    updateRole: vi.fn().mockResolvedValue(customRole),
    deleteRole: vi.fn().mockResolvedValue(undefined),
    listPermissions: vi.fn().mockResolvedValue(availablePermissions),
    ...overrides,
  };
}

function renderRolesPage(
  permissions: PermissionKey[],
  options: {
    api?: RolesApi;
    pagePermissions?: IamPermission[];
    roles?: IamRoleWithPermissions[];
  } = {},
) {
  render(
    <RolesPage
      api={options.api}
      permissions={["permissions.read", ...permissions]}
      roleItems={options.roles ?? [systemRole, customRole]}
      permissionItems={options.pagePermissions ?? availablePermissions}
    />,
  );
}

describe("RolesPage", () => {
  it("loads the role list without requesting permissions when permissions.read is unavailable", async () => {
    const api = createIamApi({
      listPermissions: vi.fn().mockRejectedValue(new Error("forbidden")),
    });

    render(<RolesPage api={api} permissions={["roles.read"]} />);

    expect(await screen.findByText("账务管理员")).toBeInTheDocument();
    expect(api.listRoles).toHaveBeenCalledTimes(1);
    expect(api.listPermissions).not.toHaveBeenCalled();
  });

  it("keeps permission editing unavailable without permissions.read", async () => {
    const user = userEvent.setup();

    render(
      <RolesPage
        permissionItems={availablePermissions}
        permissions={["roles.read", "roles.update", "roles.permissions.update"]}
        roleItems={[customRole]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑 账务管理员" }));

    expect(screen.getByRole("checkbox", { name: "查看角色" })).toBeDisabled();
  });

  it("does not offer edit or delete actions for a non-editable system role", () => {
    renderRolesPage(["roles.read", "roles.update", "roles.delete"]);

    expect(screen.queryByRole("button", { name: "编辑 所有者" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 所有者" })).not.toBeInTheDocument();
  });

  it("reports role creation validation errors before requesting the API", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles.read", "roles.create"], { api });

    await user.click(screen.getByRole("button", { name: "新增角色" }));
    await user.click(screen.getByRole("button", { name: "创建角色" }));

    expect(screen.getByText("请输入角色标识")).toBeInTheDocument();
    expect(screen.getByText("请输入角色名称")).toBeInTheDocument();
    expect(api.createRole).not.toHaveBeenCalled();
  });

  it("normalizes the role key, trims the name, and submits selected permissions when creating", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles.read", "roles.create", "roles.permissions.update"], { api });

    await user.click(screen.getByRole("button", { name: "新增角色" }));
    await user.type(screen.getByRole("textbox", { name: "角色标识" }), "  Book Keeper  ");
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "记账员");
    await user.click(screen.getByRole("checkbox", { name: "查看成员" }));
    await user.click(screen.getByRole("button", { name: "创建角色" }));

    await waitFor(() =>
      expect(api.createRole).toHaveBeenCalledWith({
        key: "book-keeper",
        name: "记账员",
        description: "",
        permissionKeys: ["members.read"],
      }),
    );
  });

  it("keeps the editor open and preserves values when creating a role fails", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      createRole: vi.fn().mockRejectedValue(new Error("authorization=secret")),
    });
    renderRolesPage(["roles.read", "roles.create"], { api });

    await user.click(screen.getByRole("button", { name: "新增角色" }));
    await user.type(screen.getByRole("textbox", { name: "角色标识" }), "book-keeper");
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "记账员");
    await user.click(screen.getByRole("button", { name: "创建角色" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("新增角色失败，请稍后重试。");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "角色名称" })).toHaveValue("记账员");
    expect(screen.queryByText(/authorization=secret/i)).not.toBeInTheDocument();
  });

  it("asks for confirmation before deleting an editable role", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles.read", "roles.delete"], { api });

    await user.click(screen.getByRole("button", { name: "删除 账务管理员" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("确认删除角色");
    expect(api.deleteRole).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(api.deleteRole).toHaveBeenCalledWith("role-bookkeeper"));
  });

  it("omits permissionKeys when updating details without roles.permissions.update", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles.read", "roles.update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 账务管理员" }));
    await user.clear(screen.getByRole("textbox", { name: "角色名称" }));
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "账务主管");
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    await waitFor(() =>
      expect(api.updateRole).toHaveBeenCalledWith("role-bookkeeper", {
        name: "账务主管",
        description: "管理账本",
      }),
    );
  });

  it("keeps the editor and values open when updating a role fails", async () => {
    const user = userEvent.setup();
    const api = createIamApi({ updateRole: vi.fn().mockRejectedValue(new Error("network")) });
    renderRolesPage(["roles.read", "roles.update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 账务管理员" }));
    await user.clear(screen.getByRole("textbox", { name: "角色名称" }));
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "失败后保留");
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("更新角色失败，请稍后重试。");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "角色名称" })).toHaveValue("失败后保留");
  });

  it("reopens an editor with the latest role data after a successful update", async () => {
    const user = userEvent.setup();
    const updatedRole = { ...customRole, name: "账务主管", description: "更新后的职责" };
    const api = createIamApi({
      listRoles: vi.fn().mockResolvedValue([systemRole, updatedRole]),
      updateRole: vi.fn().mockResolvedValue(customRole),
    });
    renderRolesPage(["roles.read", "roles.update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 账务管理员" }));
    await user.clear(screen.getByRole("textbox", { name: "角色名称" }));
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "账务主管");
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "编辑 账务主管" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "编辑 账务主管" }));

    expect(screen.getByRole("textbox", { name: "角色名称" })).toHaveValue("账务主管");
    expect(screen.getByRole("textbox", { name: "角色说明" })).toHaveValue("更新后的职责");
  });

  it("closes the editor after a successful update even when refreshing roles fails", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      listRoles: vi.fn().mockRejectedValue(new Error("network")),
      updateRole: vi.fn().mockResolvedValue(customRole),
    });
    renderRolesPage(["roles.read", "roles.update"], { api });

    await user.click(screen.getByRole("button", { name: "编辑 账务管理员" }));
    await user.click(screen.getByRole("button", { name: "保存角色" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "角色已更新，但刷新列表失败，请稍后重试。",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
