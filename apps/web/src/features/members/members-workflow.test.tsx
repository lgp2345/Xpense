import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { IamApi, IamMember, IamRole } from "../../services/iam-api";
import { MembersPage } from "./members-page";

const member: IamMember = {
  id: "member-1",
  organizationId: "org-1",
  userId: "user-1",
  username: "member",
  email: "member@example.com",
  phone: null,
  roleId: "role-member",
  roleKey: "member",
  roleName: "普通成员",
  status: "active",
  joinedAt: "2026-07-04T08:00:00.000Z",
};

const disabledMember: IamMember = {
  ...member,
  id: "member-2",
  username: "disabled",
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
    description: "可查看组织",
    isSystem: false,
    isEditable: true,
  },
];
const budgetRole: IamRole = {
  id: "role-budget",
  organizationId: "org-1",
  key: "budget-manager",
  name: "预算管理员",
  description: "管理预算",
  isSystem: false,
  isEditable: true,
};

const validPhone = "13800000001";

function createIamApi(
  overrides: Partial<IamApi> = {},
): Pick<
  IamApi,
  "listMembers" | "createMember" | "updateMember" | "listRoles" | "listMemberAccounts"
> {
  return {
    listMembers: vi.fn().mockResolvedValue([member]),
    createMember: vi.fn().mockResolvedValue(member),
    updateMember: vi.fn().mockResolvedValue(member),
    listMemberAccounts: vi.fn().mockResolvedValue(null),
    listRoles: vi.fn().mockResolvedValue(roles),
    ...overrides,
  };
}

function renderMembersPage(
  permissions: PermissionKey[],
  options: {
    api?: Pick<
      IamApi,
      "listMembers" | "createMember" | "updateMember" | "listRoles" | "listMemberAccounts"
    >;
    members?: IamMember[];
    pageRoles?: IamRole[];
    actorRoleKey?: string;
  } = {},
) {
  render(
    <MembersPage
      actorRoleKey={options.actorRoleKey}
      api={options.api}
      members={options.members ?? [member]}
      permissions={["roles:read", ...permissions]}
      roles={options.pageRoles ?? roles}
    />,
  );
}

describe("MembersPage", () => {
  it("displays and searches members by phone when email is absent", async () => {
    const user = userEvent.setup();
    const phoneMember = { ...member, email: null, phone: "13800000001" } satisfies IamMember;
    renderMembersPage(["members:read"], { members: [phoneMember, disabledMember] });
    expect(screen.getByText("13800000001")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "13800000001");
    expect(screen.getByText("13800000001")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "查询" }));
    expect(screen.queryByText("disabled@example.com")).not.toBeInTheDocument();
  });

  it("使用横线日期显示本地加入时间", () => {
    renderMembersPage(["members:read"], {
      members: [{ ...member, joinedAt: new Date(2026, 0, 2, 3, 4).toISOString() }],
    });
    expect(screen.getByText("2026-01-02 03:04")).toBeInTheDocument();
  });

  it("filters all members before paging and resets the page when page size changes", async () => {
    const user = userEvent.setup();
    const members = Array.from({ length: 25 }, (_, index) => ({
      ...member,
      id: `member-${index}`,
      email: `member${index}@example.com`,
    }));
    renderMembersPage(["members:read"], { members });
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("第 2 页，共 3 页")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("搜索邮箱、手机号或用户名..."), "member24@");
    await user.click(screen.getByRole("button", { name: "查询" }));
    expect(screen.getByText("member24@example.com")).toBeInTheDocument();
    expect(screen.getByText("第 1 页，共 1 页")).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText("搜索邮箱、手机号或用户名..."));
    await user.click(screen.getByRole("button", { name: "查询" }));
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await user.click(screen.getByRole("combobox", { name: "每页行数" }));
    await user.click(await screen.findByRole("option", { name: "20" }));
    expect(screen.getByText("第 1 页，共 2 页")).toBeInTheDocument();
  });

  it("loads the member list without requesting roles when roles.read is unavailable", async () => {
    const api = createIamApi({
      listRoles: vi.fn().mockRejectedValue(new Error("forbidden")),
    });

    render(<MembersPage api={api} permissions={["members:read"]} />);

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
        permissions={["members:read", "members:create", "members:update"]}
      />,
    );

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增成员" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "编辑 member@example.com" }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no members", async () => {
    renderMembersPage(["members:read"], { members: [] });

    expect(await screen.findByText("当前没有成员。")).toBeInTheDocument();
  });

  it("hides the create action when members.create is unavailable", () => {
    renderMembersPage(["members:read"]);

    expect(screen.queryByRole("button", { name: "新增成员" })).not.toBeInTheDocument();
  });

  it("shows the create action when members.create is available", () => {
    renderMembersPage(["members:read", "members:create"]);

    expect(screen.getByRole("button", { name: "新增成员" })).toBeInTheDocument();
  });

  it("shows only the permitted member actions for each member status", async () => {
    renderMembersPage(["members:read", "members:update", "members:disable", "members:enable"], {
      members: [member, disabledMember],
    });

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "禁用 member@example.com" })).toHaveTextContent(
      /^禁用$/,
    );
    expect(screen.getByRole("button", { name: "启用 disabled@example.com" })).toHaveTextContent(
      /^启用$/,
    );
    // 活跃成员：禁用按钮可点击，启用按钮 disabled + tooltip
    expect(screen.getByRole("button", { name: "禁用 member@example.com" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "启用 member@example.com" })).toBeDisabled();
    // 禁用成员：启用按钮可点击，禁用按钮 disabled + tooltip
    expect(screen.getByRole("button", { name: "启用 disabled@example.com" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "禁用 disabled@example.com" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑 member@example.com" })).toBeInTheDocument();
  });

  it("hides role change controls without members.update permission", async () => {
    renderMembersPage(["members:read", "members:disable", "members:enable"], {
      members: [member, disabledMember],
    });

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "编辑 member@example.com" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "禁用 member@example.com" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启用 disabled@example.com" })).toBeInTheDocument();
  });

  it("hides disable controls without members.disable permission", async () => {
    renderMembersPage(["members:read", "members:update", "members:enable"], {
      members: [member, disabledMember],
    });

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "禁用 member@example.com" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启用 disabled@example.com" })).toBeInTheDocument();
  });

  it("hides enable controls without members.enable permission", async () => {
    renderMembersPage(["members:read", "members:update", "members:disable"], {
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
    renderMembersPage(["members:read", "members:disable"], { api });

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
    renderMembersPage(["members:read", "members:enable"], {
      api,
      members: [disabledMember],
    });

    await user.click(screen.getByRole("button", { name: "启用 disabled@example.com" }));

    await waitFor(() =>
      expect(api.updateMember).toHaveBeenCalledWith("member-2", { status: "active" }),
    );
  });

  it("rejects an invalid phone before looking up an account", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderMembersPage(["members:read", "members:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByRole("textbox", { name: "手机号" }), "123");
    await user.click(screen.getByRole("textbox", { name: "用户名" }));

    expect(await screen.findByText("请输入有效的手机号")).toBeInTheDocument();
    expect(api.listMemberAccounts).not.toHaveBeenCalled();
    expect(api.createMember).not.toHaveBeenCalled();
  });

  it("requires a username and at least one role before creating a member", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderMembersPage(["members:read", "members:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    expect(screen.getByText("请输入用户名")).toBeInTheDocument();
    expect(screen.getByText("至少选择一个角色")).toBeInTheDocument();
    expect(api.createMember).not.toHaveBeenCalled();
  });

  it("removes cleared role chips and rejects an empty role selection", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderMembersPage(["members:read", "members:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByRole("textbox", { name: "手机号" }), validPhone);
    await user.click(screen.getByRole("textbox", { name: "用户名" }));
    await waitFor(() => expect(api.listMemberAccounts).toHaveBeenCalledWith(validPhone));
    await user.type(screen.getByRole("textbox", { name: "用户名" }), "new-user");
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(await screen.findByRole("option", { name: "普通成员" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("普通成员")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(dialog.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    expect(await screen.findByText("至少选择一个角色")).toBeInTheDocument();
    expect(api.createMember).not.toHaveBeenCalled();
  });

  it.each([
    "active",
    "disabled",
  ] as const)("creates a %s member, closes the dialog, and refreshes the list", async (status) => {
    const user = userEvent.setup();
    const newMember: IamMember = {
      ...member,
      id: "member-3",
      username: "new-user",
      email: "new-member@example.com",
      phone: validPhone,
      status,
    };
    const api = createIamApi({
      createMember: vi.fn().mockResolvedValue(newMember),
      listMembers: vi.fn().mockResolvedValue([member, newMember]),
    });
    renderMembersPage(["members:read", "members:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByRole("textbox", { name: "手机号" }), validPhone);
    await user.click(screen.getByRole("textbox", { name: "用户名" }));
    await waitFor(() => expect(api.listMemberAccounts).toHaveBeenCalledWith(validPhone));
    await user.type(screen.getByRole("textbox", { name: "用户名" }), "new-user");
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(await screen.findByRole("option", { name: "普通成员" }));
    expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("已启用");
    if (status === "disabled") {
      await user.click(screen.getByRole("combobox", { name: "状态" }));
      await user.click(await screen.findByRole("option", { name: "已禁用" }));
    }
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    expect(await screen.findByText("new-member@example.com")).toBeInTheDocument();
    expect(api.createMember).toHaveBeenCalledWith({
      phone: validPhone,
      status,
      username: "new-user",
      roleIds: ["role-member"],
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open with a safe error when member creation fails", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      createMember: vi.fn().mockRejectedValue(new Error("authorization=secret")),
    });
    renderMembersPage(["members:read", "members:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByRole("textbox", { name: "手机号" }), validPhone);
    await user.click(screen.getByRole("textbox", { name: "用户名" }));
    await waitFor(() => expect(api.listMemberAccounts).toHaveBeenCalledWith(validPhone));
    await user.type(screen.getByRole("textbox", { name: "用户名" }), "new-user");
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(await screen.findByRole("option", { name: "普通成员" }));
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("添加成员失败，请稍后重试。");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "用户名" })).toHaveValue("new-user");
    expect(screen.queryByText(/authorization=secret/i)).not.toBeInTheDocument();
  });

  it("reuses and locks the username of an existing account", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      listMemberAccounts: vi
        .fn()
        .mockResolvedValue({ username: "existing-user", status: "active" }),
    });
    renderMembersPage(["members:read", "members:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByRole("textbox", { name: "手机号" }), ` ${validPhone} `);
    await user.click(screen.getByRole("textbox", { name: "用户名" }));

    const username = await screen.findByRole("textbox", { name: "用户名" });
    await waitFor(() => expect(username).toHaveValue("existing-user"));
    expect(username).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(await screen.findByRole("option", { name: "普通成员" }));
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    await waitFor(() =>
      expect(api.createMember).toHaveBeenCalledWith({
        phone: validPhone,
        username: "existing-user",
        roleIds: ["role-member"],
        status: "active",
      }),
    );
  });

  it("prevents adding a disabled account", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      listMemberAccounts: vi
        .fn()
        .mockResolvedValue({ username: "disabled-user", status: "disabled" }),
    });
    renderMembersPage(["members:read", "members:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByRole("textbox", { name: "手机号" }), validPhone);
    await user.click(screen.getByRole("textbox", { name: "用户名" }));
    expect(await screen.findByText("该账号已禁用，无法添加成员。")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(await screen.findByRole("option", { name: "普通成员" }));
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("该账号已禁用，无法添加成员。");
    expect(api.createMember).not.toHaveBeenCalled();
  });

  it("retries a failed phone lookup and allows creation after success", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      listMemberAccounts: vi
        .fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce(null),
    });
    renderMembersPage(["members:read", "members:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByRole("textbox", { name: "手机号" }), validPhone);
    await user.click(screen.getByRole("textbox", { name: "用户名" }));
    expect(await screen.findByText("手机号查询失败，请重试。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试验证手机号" }));
    await waitFor(() => expect(api.listMemberAccounts).toHaveBeenCalledTimes(2));
    await user.type(screen.getByRole("textbox", { name: "用户名" }), "new-user");
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(await screen.findByRole("option", { name: "普通成员" }));
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    expect(api.createMember).toHaveBeenCalledWith({
      phone: validPhone,
      username: "new-user",
      roleIds: ["role-member"],
      status: "active",
    });
  });

  it("ignores stale phone lookup responses after the phone changes", async () => {
    const user = userEvent.setup();
    let resolveFirst: ((value: { username: string; status: "active" } | null) => void) | undefined;
    let resolveSecond: ((value: { username: string; status: "active" } | null) => void) | undefined;
    const firstRequest = new Promise<{ username: string; status: "active" } | null>((resolve) => {
      resolveFirst = resolve;
    });
    const secondRequest = new Promise<{ username: string; status: "active" } | null>((resolve) => {
      resolveSecond = resolve;
    });
    const api = createIamApi({
      listMemberAccounts: vi
        .fn()
        .mockReturnValueOnce(firstRequest)
        .mockReturnValueOnce(secondRequest),
    });
    renderMembersPage(["members:read", "members:create"], { api });

    await user.click(screen.getByRole("button", { name: "新增成员" }));
    const phone = screen.getByRole("textbox", { name: "手机号" });
    await user.type(phone, validPhone);
    await user.click(screen.getByRole("textbox", { name: "用户名" }));
    await waitFor(() => expect(api.listMemberAccounts).toHaveBeenCalledTimes(1));
    await user.clear(phone);
    await user.type(phone, "13900000002");
    await user.click(screen.getByRole("textbox", { name: "用户名" }));
    await waitFor(() => expect(api.listMemberAccounts).toHaveBeenCalledTimes(2));

    resolveSecond?.({ username: "second-user", status: "active" });
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "用户名" })).toHaveValue("second-user"),
    );
    resolveFirst?.({ username: "first-user", status: "active" });

    expect(screen.getByRole("textbox", { name: "用户名" })).toHaveValue("second-user");
  });

  it("updates several member roles and displays all role names", async () => {
    const user = userEvent.setup();
    const api = createIamApi();
    const multiRoleMember = {
      ...member,
      roles: [{ id: "role-member", key: "member", name: "普通成员" }],
    };
    renderMembersPage(["members:read", "members:update"], {
      api,
      actorRoleKey: "owner",
      members: [multiRoleMember],
      pageRoles: [...roles, budgetRole],
    });

    await user.click(screen.getByRole("button", { name: "编辑 member@example.com" }));
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(await screen.findByRole("option", { name: "所有者" }));
    expect(api.updateMember).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() =>
      expect(api.updateMember).toHaveBeenCalledWith("member-1", {
        roleIds: ["role-member", "role-owner"],
      }),
    );
  });

  it.each([
    {
      status: "active",
      nextStatus: "disabled",
      permission: "members:disable",
      currentLabel: "已启用",
      nextLabel: "已禁用",
    },
    {
      status: "disabled",
      nextStatus: "active",
      permission: "members:enable",
      currentLabel: "已禁用",
      nextLabel: "已启用",
    },
  ] as const)("opens an email-only member editor and changes $status to $nextStatus", async ({
    status,
    nextStatus,
    permission,
    currentLabel,
    nextLabel,
  }) => {
    const user = userEvent.setup();
    const updated = { ...member, status: nextStatus };
    const api = createIamApi({ listMembers: vi.fn().mockResolvedValue([updated]) });
    renderMembersPage(["members:read", "members:update", permission], {
      api,
      members: [{ ...member, status }],
    });
    await user.click(screen.getByRole("button", { name: "编辑 member@example.com" }));
    expect(screen.getByRole("heading", { name: "编辑成员" })).toBeInTheDocument();
    expect(screen.getByLabelText("手机号")).toBeDisabled();
    expect(screen.getByLabelText("用户名")).toHaveValue("member");
    expect(screen.getByLabelText("用户名")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent(currentLabel);
    expect(within(screen.getByRole("dialog")).getByText("普通成员")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "状态" }));
    await user.click(await screen.findByRole("option", { name: nextLabel }));
    expect(api.updateMember).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() =>
      expect(api.updateMember).toHaveBeenCalledWith("member-1", {
        roleIds: ["role-member"],
        status: nextStatus,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(nextLabel)).toBeInTheDocument();
    expect(api.listMemberAccounts).not.toHaveBeenCalled();
    expect(api.createMember).not.toHaveBeenCalled();
  });

  it.each([
    "active",
    "disabled",
  ] as const)("protects %s status without permission and restores cancelled edits", async (status) => {
    const user = userEvent.setup();
    const api = createIamApi();
    renderMembersPage(["members:read", "members:update"], {
      api,
      pageRoles: [...roles, budgetRole],
      members: [{ ...member, status }],
    });
    await user.click(screen.getByRole("button", { name: "编辑 member@example.com" }));
    expect(screen.getByRole("combobox", { name: "状态" })).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(await screen.findByRole("option", { name: "预算管理员" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(api.updateMember).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "编辑 member@example.com" }));
    expect(within(screen.getByRole("dialog")).queryByText("预算管理员")).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("普通成员")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() =>
      expect(api.updateMember).toHaveBeenCalledWith("member-1", { roleIds: ["role-member"] }),
    );
  });

  it("keeps edits after save fails and disables controls while saving", async () => {
    const user = userEvent.setup();
    let rejectSave: (error: Error) => void = () => {};
    const api = createIamApi({
      updateMember: vi.fn(
        () =>
          new Promise<IamMember>((_, reject) => {
            rejectSave = reject;
          }),
      ),
    });
    renderMembersPage(["members:read", "members:update", "members:disable"], { api });
    await user.click(screen.getByRole("button", { name: "编辑 member@example.com" }));
    await user.click(screen.getByRole("combobox", { name: "状态" }));
    await user.click(await screen.findByRole("option", { name: "已禁用" }));
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(api.updateMember).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "正在保存..." })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "角色" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "状态" })).toBeDisabled();
    rejectSave(new Error("network failure"));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "保存成员失败，请稍后重试。",
    );
    expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("已禁用");
    expect(screen.getByRole("button", { name: "保存修改" })).toBeEnabled();
  });

  it("searches member usernames and filters rows by any assigned role", async () => {
    const user = userEvent.setup();
    const multiRoleMember = {
      ...member,
      username: "budget-user",
      roles: [
        { id: "role-member", key: "member", name: "普通成员" },
        { id: "role-budget", key: "budget-manager", name: "预算管理员" },
      ],
    };
    renderMembersPage(["members:read"], {
      members: [multiRoleMember, { ...disabledMember, roles: undefined }],
      pageRoles: [...roles, budgetRole],
    });

    expect(screen.getByText("普通成员、预算管理员")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("搜索邮箱、手机号或用户名..."), "budget-user");
    await user.click(screen.getByRole("button", { name: "查询" }));
    expect(screen.getByText("budget-user")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "查询" }));
    expect(screen.queryByText("disabled@example.com")).not.toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText("搜索邮箱、手机号或用户名..."));
    await user.click(screen.getByRole("button", { name: "查询" }));
    const roleFilter = screen.getByRole("combobox", { name: "角色" });
    await user.click(roleFilter);
    await user.click(await screen.findByRole("option", { name: "预算管理员" }));
    expect(screen.getByText("budget-user")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "查询" }));
    expect(screen.queryByText("disabled@example.com")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重置" }));
    expect(screen.getByText("disabled@example.com")).toBeInTheDocument();
  });

  it("shows a safe error message when a member update fails", async () => {
    const user = userEvent.setup();
    const api = createIamApi({
      updateMember: vi.fn().mockRejectedValue(new Error("authorization=secret")),
    });
    renderMembersPage(["members:read", "members:enable"], { api, members: [disabledMember] });

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

    render(<MembersPage api={api} permissions={["members:read"]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("加载成员列表失败，请稍后重试。");

    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("负责人操作保护", () => {
  const ownerMember = {
    ...member,
    roleId: "role-owner",
    roleKey: "owner",
    roleName: "组织负责人",
    effectiveOwnerCount: 1,
  };
  it.each([
    "admin",
    "custom-full",
  ])("blocks %s from managing an owner despite full permissions", async (roleKey) => {
    const user = userEvent.setup();
    const api = createIamApi();
    render(
      <MembersPage
        api={api}
        members={[ownerMember]}
        roles={roles}
        permissions={["roles:read", "members:update", "members:disable"]}
        actorRoleKey={roleKey}
      />,
    );
    expect(screen.getByRole("button", { name: "编辑 member@example.com" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const button = screen.getByRole("button", { name: "禁用 member@example.com" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    button.focus();
    await user.keyboard("{Enter} ");
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "仅组织负责人或平台超级管理员可管理负责人",
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.updateMember).not.toHaveBeenCalled();
  });
  it("protects the final effective owner even for a platform administrator", async () => {
    const user = userEvent.setup();
    render(
      <MembersPage
        members={[ownerMember]}
        roles={roles}
        permissions={["roles:read", "members:update", "members:disable"]}
        isSuperAdmin
      />,
    );
    expect(screen.getByRole("button", { name: "编辑 member@example.com" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const button = screen.getByRole("button", { name: "禁用 member@example.com" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    button.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("tooltip")).toHaveTextContent("至少保留一位有效组织负责人");
  });
});

it("成员状态使用单选，查询后匹配启用或禁用成员，全部状态恢复所有结果", async () => {
  const user = userEvent.setup();
  renderMembersPage(["members:read"], { members: [member, disabledMember] });
  const status = screen.getByRole("combobox", { name: "状态" });
  expect(status).toHaveTextContent("全部状态");
  await user.click(status);
  await user.click(await screen.findByRole("option", { name: "已禁用" }));
  expect(screen.getByText("member@example.com")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(screen.queryByText("member@example.com")).not.toBeInTheDocument();
  expect(screen.getByText("disabled@example.com")).toBeInTheDocument();
  await user.click(status);
  await user.click(await screen.findByRole("option", { name: "已启用" }));
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(screen.getByText("member@example.com")).toBeInTheDocument();
  expect(screen.queryByText("disabled@example.com")).not.toBeInTheDocument();
  await user.click(status);
  await user.click(await screen.findByRole("option", { name: "全部状态" }));
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(screen.getByText("disabled@example.com")).toBeInTheDocument();
});

it("角色列出全部可读取角色，未分配角色也可选，全部角色清除条件", async () => {
  const user = userEvent.setup();
  renderMembersPage(["members:read"], { members: [member], pageRoles: [...roles, budgetRole] });
  const role = screen.getByRole("combobox", { name: "角色" });
  await user.click(role);
  expect(await screen.findByRole("option", { name: "所有者" })).toBeVisible();
  expect(screen.getByRole("option", { name: "普通成员" })).toBeVisible();
  expect(screen.getByRole("option", { name: "预算管理员" })).toBeVisible();
  expect(screen.getByRole("option", { name: "全部角色" })).toBeVisible();
  await user.click(screen.getByRole("option", { name: "预算管理员" }));
  await user.keyboard("{Escape}");
  expect(screen.getByText("member@example.com")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(screen.queryByText("member@example.com")).not.toBeInTheDocument();
  await user.click(role);
  await user.click(await screen.findByRole("option", { name: "全部角色" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(screen.getByText("member@example.com")).toBeVisible();
});

it("成员角色可多选，按任一所选角色匹配，修改选择后需再次查询", async () => {
  const user = userEvent.setup();
  const budgetMember: IamMember = {
    ...member,
    id: "budget",
    email: "budget@example.com",
    roleId: budgetRole.id,
    roleKey: budgetRole.key,
    roleName: budgetRole.name,
  };
  const ownerMember: IamMember = {
    ...member,
    id: "owner",
    email: "owner@example.com",
    roleId: "role-owner",
    roleKey: "owner",
    roleName: "所有者",
  };
  renderMembersPage(["members:read"], {
    members: [member, budgetMember, ownerMember],
    pageRoles: [...roles, budgetRole],
  });
  const role = screen.getByRole("combobox", { name: "角色" });
  await user.click(role);
  await user.click(await screen.findByRole("option", { name: "普通成员" }));
  await user.click(role);
  await user.click(await screen.findByRole("option", { name: "预算管理员" }));
  expect(screen.getByText("owner@example.com")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(screen.getByText("member@example.com")).toBeVisible();
  expect(screen.getByText("budget@example.com")).toBeVisible();
  expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Remove" })[0] as HTMLElement);
  expect(screen.getByText("member@example.com")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(screen.queryByText("member@example.com")).not.toBeInTheDocument();
  expect(screen.getByText("budget@example.com")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "重置" }));
  expect(screen.getByText("owner@example.com")).toBeVisible();
});
