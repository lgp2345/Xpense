import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemberFormDialog } from "./member-form-dialog";

describe("MemberFormDialog field feedback", () => {
  it("provides the standard dialog close action and clears the draft when reopened", async () => {
    const user = userEvent.setup();
    const onLookupAccount = vi.fn().mockResolvedValue(null);
    render(<MemberFormDialog roles={[]} onLookupAccount={onLookupAccount} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByLabelText("手机号"), "13800000009");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onLookupAccount).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "新增成员" }));
    expect(screen.getByLabelText("手机号")).toHaveValue("");
  });
  it("renders phone, username, and role validation beside their fields", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <MemberFormDialog
        roles={[]}
        onLookupAccount={vi.fn().mockResolvedValue(null)}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole("button", { name: "新增成员" }));
    const phone = screen.getByLabelText("手机号");
    const username = screen.getByLabelText("用户名");
    const roles = screen.getByRole("combobox", { name: "角色" });
    expect(phone.closest('[data-slot="field"]')).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加成员" }));
    expect(await screen.findByText("请输入有效的手机号")).toBeInTheDocument();
    expect(screen.getByText("请输入用户名")).toBeInTheDocument();
    expect(screen.getByText("至少选择一个角色")).toBeInTheDocument();
    expect(phone.closest('[data-slot="field"]')).toHaveAttribute("data-invalid", "true");
    expect(username.closest('[data-slot="field"]')).toHaveAttribute("data-invalid", "true");
    expect(roles.closest('[data-slot="field"]')).toHaveAttribute("data-invalid", "true");
    expect(roles.closest('[data-slot="field"]')?.lastElementChild).toHaveTextContent(
      "至少选择一个角色",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("validates role selection on blur, clears feedback on selection, and shows no-match copy", async () => {
    const user = userEvent.setup();
    const role = {
      id: "role-member",
      organizationId: "org-1",
      key: "member",
      name: "普通成员",
      description: "",
      isSystem: true,
      isEditable: false,
    };
    render(
      <MemberFormDialog
        roles={[role]}
        onLookupAccount={vi.fn().mockResolvedValue(null)}
        onSubmit={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "新增成员" }));
    const roleInput = screen.getByRole("combobox", { name: "角色" });
    await user.click(roleInput);
    await user.click(screen.getByLabelText("手机号"));

    expect(await screen.findByText("至少选择一个角色")).toBeInTheDocument();
    expect(roleInput).toHaveAttribute("aria-invalid", "true");
    expect(roleInput).toHaveAttribute("aria-describedby", "roleIds-error");

    await user.click(roleInput);
    await user.click(await screen.findByRole("option", { name: "普通成员" }));
    expect(screen.queryByText("至少选择一个角色")).not.toBeInTheDocument();
    expect(roleInput).toHaveAttribute("aria-invalid", "false");

    await user.type(roleInput, "没有这个角色");
    expect(await screen.findByText("没有匹配的角色")).toBeInTheDocument();
  });

  it("disables the role selector and actions while submission is pending", async () => {
    const user = userEvent.setup();
    let finishSubmit = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSubmit = resolve;
        }),
    );
    const role = {
      id: "role-member",
      organizationId: "org-1",
      key: "member",
      name: "普通成员",
      description: "",
      isSystem: true,
      isEditable: false,
    };
    render(
      <MemberFormDialog
        roles={[role]}
        onLookupAccount={vi.fn().mockResolvedValue(null)}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole("button", { name: "新增成员" }));
    await user.type(screen.getByRole("textbox", { name: "手机号" }), "13800000000");
    await user.click(screen.getByRole("textbox", { name: "用户名" }));
    await waitFor(() =>
      expect(screen.getByText("未找到现有账号，可以设置新用户名。")).toBeInTheDocument(),
    );
    await user.type(screen.getByRole("textbox", { name: "用户名" }), "new-user");
    const roleInput = screen.getByRole("combobox", { name: "角色" });
    await user.click(roleInput);
    await user.click(await screen.findByRole("option", { name: "普通成员" }));
    await user.click(screen.getByRole("button", { name: "添加成员" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(roleInput).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "正在添加..." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "正在添加..." }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    finishSubmit();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
