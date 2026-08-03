import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { IamApi, IamMember, IamRole } from "../../services/iam-api";
import { MembersPage } from "./members-page";

const member: IamMember = {
  id: "member-1",
  organizationId: "org-1",
  userId: "user-1",
  email: "member@example.com",
  roleId: "role-member",
  roleKey: "member",
  roleName: "普通成员",
  status: "active",
  joinedAt: "2026-07-04T08:00:00.000Z",
};

const disabledMember: IamMember = {
  ...member,
  id: "member-2",
  email: "disabled@example.com",
  status: "disabled",
};

const roles: IamRole[] = [
  {
    id: "role-owner",
    organizationId: "org-1",
    key: "owner",
    name: "所有者",
    description: "拥有全部管理权限",
    isSystem: true,
    isEditable: false,
  },
  {
    id: "role-member",
    organizationId: "org-1",
    key: "member",
    name: "普通成员",
    description: "可查看账本",
    isSystem: false,
    isEditable: true,
  },
];

const validUserId = "b7d2b905-075d-4a18-9340-2f0e0d1dc4f1";

function createIamApi(
  overrides: Partial<IamApi> = {},
): Pick<IamApi, "listMembers" | "createMember" | "updateMember" | "listRoles"> {
  return {
    listMembers: vi.fn().mockResolvedValue([member]),
    createMember: vi.fn().mockResolvedValue(member),
    updateMember: vi.fn().mockResolvedValue(member),
    listRoles: vi.fn().mockResolvedValue(roles),
    ...overrides,
  };
}

function renderMembersPage(
  permissions: PermissionKey[],
  options: {
    api?: Pick<IamApi, "listMembers" | "createMember" | "updateMember" | "listRoles">;
    members?: IamMember[];
    pageRoles?: IamRole[];
  } = {},
) {
  render(
    <MembersPage
      api={options.api}
      members={options.members ?? [member]}
      permissions={["roles.read", ...permissions]}
      roles={options.pageRoles ?? roles}
    />,
  );
}

describe("MembersPage", () => {
  it("loads the member list without requesting roles when roles.read is unavailable", async () => {
    const api = createIamApi({
      listRoles: vi.fn().mockRejectedValue(new Error("forbidden")),
    });

    render(<MembersPage api={api} permissions={["members.read"]} />);

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(api.listMembers).toHaveBeenCalledTimes(1);
    expect(api.listRoles).not.toHaveBeenCalled();
  });

  it("keeps role-dependent member actions unavailable without roles.read", async () => {
    const api = createIamApi();

    render(
      <MembersPage
        api={api}
        members={[member]}
        permissions={["members.read", "members.create", "members.update"]}
      />,
    );

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增成员" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /变更 member@example\.com 的角色/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no members", async () => {
    renderMembersPage(["members.read"], { members: [] });

    expect(await screen.findByText("当前没有成员。")).toBeInTheDocument();
  });

  it("hides the create action when members.create is unavailable", () => {
    renderMembersPage(["members.read"]);

    expect(screen.queryByRole("button", { name: "新增成员" })).not.toBeInTheDocument();
  });

  it("shows the create action when members.create is available", () => {
    renderMembersPage(["members.read", "members.create"]);

    expect(screen.getByRole("button", { name: "新增成员" })).toBeInTheDocument();
  });

  it("shows only the permitted member actions for each member status", async () => {
    renderMembersPage(["members.read", "members.update", "members.disable", "members.enable"], {
      members: [member, disabledMember],
    });

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "禁用 member@example.com" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "启用 member@example.com" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启用 disabled@example.com" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "禁用 disabled@example.com" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /变更 member@example\.com 的角色/ }),
    ).toBeInTheDocument();
  });

  it("hides role change controls without members.update permission", async () => {
    renderMembersPage(["members.read", "members.disable", "members.enable"], {
      members: [member, disabledMember],
    });

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /变更 member@example\.com 的角色/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "禁用 member@example.com" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启用 disabled@example.com" })).toBeInTheDocument();
  });

  it("hides disable controls without members.disable permission", async () => {
    renderMembersPage(["members.read", "members.update", "members.enable"], {
      members: [member, disabledMember],
    });

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "禁用 member@example.com" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启用 disabled@example.com" })).toBeInTheDocument();
  });

  it("hides enable controls without members.enable permission", async () => {
    renderMembersPage(["members.read", "members.update", "members.disable"], {
      members: [member, disabledMember],
    });

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "禁用 member@example.com" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "启用 disabled@example.com" }),
    ).not.toBeInTheDocument();
  });

  it("asks for confirmation before disabling a member", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderMembersPage(["members.read", "members.disable"], { api });

    await user.click(screen.getByRole("button", { name: "禁用 member@example.com" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("确认禁用成员");
    expect(api.updateMember).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认禁用" }));

    await waitFor(() =>
      expect(api.updateMember).toHaveBeenCalledWith("member-1", { status: "disabled" }),
    );
  });

  it("enables a disabled member directly", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderMembersPage(["members.read", "members.enable"], {
      api,
      members: [disabledMember],
    });

    await user.click(screen.getByRole("button", { name: "启用 disabled@example.com" }));

    await waitFor(() =>
      expect(api.updateMember).toHaveBeenCalledWith("member-2", { status: "active" }),
    );
  });

  it("reports member creation field validation errors before requesting the API", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderMembersPage(["members.read", "members.create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    expect(screen.getByText("请输入用户 ID")).toBeInTheDocument();
    expect(screen.getByText("请选择角色")).toBeInTheDocument();
    expect(api.createMember).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "用户 ID" }), "not-a-uuid");
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    expect(screen.getByText("请输入有效的 UUID")).toBeInTheDocument();
    expect(api.createMember).not.toHaveBeenCalled();
  });

  it("creates a member, closes the dialog, and refreshes the list", async () => {
    const user = userEvent.setup();
    const newMember: IamMember = {
      ...member,
      id: "member-3",
      email: "new-member@example.com",
      userId: validUserId,
    };
    const api = createIamApi({
      createMember: vi.fn().mockResolvedValue(newMember),
      listMembers: vi.fn().mockResolvedValue([member, newMember]),
    });
    renderMembersPage(["members.read", "members.create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByRole("textbox", { name: "用户 ID" }), validUserId);
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(screen.getByRole("option", { name: "普通成员" }));
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    expect(await screen.findByText("new-member@example.com")).toBeInTheDocument();
    expect(api.createMember).toHaveBeenCalledWith({
      userId: validUserId,
      roleId: "role-member",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open with a safe error when member creation fails", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      createMember: vi.fn().mockRejectedValue(new Error("authorization=secret")),
    });
    renderMembersPage(["members.read", "members.create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByRole("textbox", { name: "用户 ID" }), validUserId);
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(screen.getByRole("option", { name: "普通成员" }));
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("添加成员失败，请稍后重试。");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "用户 ID" })).toHaveValue(validUserId);
    expect(screen.queryByText(/authorization=secret/i)).not.toBeInTheDocument();
  });

  it("updates the member role from the row select", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderMembersPage(["members.read", "members.update"], { api });

    await user.click(screen.getByRole("combobox", { name: /变更 member@example\.com 的角色/ }));
    await user.click(screen.getByRole("option", { name: "所有者" }));

    await waitFor(() =>
      expect(api.updateMember).toHaveBeenCalledWith("member-1", { roleId: "role-owner" }),
    );
  });

  it("shows a safe error message when a member update fails", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      updateMember: vi.fn().mockRejectedValue(new Error("authorization=secret")),
    });
    renderMembersPage(["members.read", "members.enable"], { api, members: [disabledMember] });

    await user.click(screen.getByRole("button", { name: "启用 disabled@example.com" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("更新成员状态失败，请稍后重试。");
    expect(screen.queryByText(/authorization=secret/i)).not.toBeInTheDocument();
  });

  it("retries a failed initial load and clears the error after the list is available", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      listMembers: vi
        .fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce([member]),
      listRoles: vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(roles),
    });

    render(<MembersPage api={api} permissions={["members.read"]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("加载成员列表失败，请稍后重试。");

    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
