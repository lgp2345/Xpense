import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemberFormDialog } from "./member-form-dialog";

describe("MemberFormDialog field feedback", () => {
  it("renders conditional shadcn errors and invalid field state for input and select", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<MemberFormDialog roles={[]} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "新增成员" }));
    const input = screen.getByLabelText("用户 ID");
    const select = screen.getByRole("combobox", { name: "角色" });
    expect(input.closest('[data-slot="field"]')).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加成员" }));
    expect(await screen.findByText("请输入用户 ID")).toBeInTheDocument();
    const inputField = input.closest('[data-slot="field"]');
    const selectField = select.closest('[data-slot="field"]');
    expect(inputField).toHaveAttribute("data-invalid", "true");
    expect(inputField?.lastElementChild).toHaveTextContent("请输入用户 ID");
    expect(selectField?.lastElementChild).toHaveTextContent("请选择角色");
    expect(selectField?.lastElementChild).toHaveAttribute("data-slot", "field-error");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
