import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { IamApi, IamPermission, IamRole } from "../../services/iam-api";
import { RolesPage } from "./roles-page";

const systemRole: IamRole = {
  id: "role-owner",
  organizationId: null,
  key: "owner",
  name: "所有者",
  description: "拥有全部管理权限",
  isSystem: true,
  isEditable: false,
  permissionKeys: ["roles.read"],
};

const customRole: IamRole = {
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
    roles?: IamRole[];
  } = {},
) {
  render(
    <RolesPage
      api={options.api}
      permissions={permissions}
      roleItems={options.roles ?? [systemRole, customRole]}
      permissionItems={options.pagePermissions ?? availablePermissions}
    />,
  );
}

describe("RolesPage", () => {
  it("does not offer edit or delete actions for a non-editable system role", () => {
    renderRolesPage(["roles.read", "roles.update", "roles.delete"]);

    expect(screen.queryByRole("button", { name: "编辑 所有者" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 所有者" })).not.toBeInTheDocument();
  });

  it("normalizes a custom role key to a lowercase slug before creating it", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderRolesPage(["roles.read", "roles.create"], { api });

    await user.click(screen.getByRole("button", { name: "新增角色" }));
    await user.type(screen.getByRole("textbox", { name: "角色标识" }), "Book Keeper!");
    await user.type(screen.getByRole("textbox", { name: "角色名称" }), "账务管理员");
    await user.click(screen.getByRole("button", { name: "创建角色" }));

    await waitFor(() =>
      expect(api.createRole).toHaveBeenCalledWith({
        key: "book-keeper",
        name: "账务管理员",
        description: "",
        permissionKeys: [],
      }),
    );
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
});
