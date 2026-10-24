import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import MultipleSelector, { type Option } from "./multi-select";

const options = [
  { value: "role-001", label: "账务管理员" },
  { value: "role-002", label: "普通成员" },
];

function SelectorForm({ onSubmit }: { onSubmit: () => void }) {
  const [value, setValue] = useState<Option[]>([]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <MultipleSelector
        commandProps={{ label: "角色" }}
        options={options}
        value={value}
        onChange={setValue}
        inputProps={{ "aria-label": "角色" }}
        emptyIndicator="没有匹配角色"
      />
      <output aria-label="已选角色">{value.map((option) => option.value).join(",")}</output>
    </form>
  );
}

describe("MultipleSelector", () => {
  it("展开后切为禁用状态不能继续选择选项", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const props = { options, commandProps: { label: "角色" }, onChange };
    const view = render(<MultipleSelector {...props} />);
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    const option = await screen.findByRole("option", { name: "账务管理员" });
    view.rerender(<MultipleSelector {...props} disabled />);
    await user.click(option);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("禁用状态下不能移除已选标签", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultipleSelector
        disabled
        value={[{ value: "role-001", label: "账务管理员" }]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onChange).not.toHaveBeenCalled();
  });
  it("按显示名称筛选，支持多选和清空", async () => {
    const user = userEvent.setup();
    render(<SelectorForm onSubmit={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "角色" });
    await user.type(input, "账务");
    await user.click(await screen.findByRole("option", { name: "账务管理员" }));
    await user.type(input, "普通");
    await user.click(await screen.findByRole("option", { name: "普通成员" }));
    expect(screen.getByLabelText("已选角色")).toHaveTextContent("role-001,role-002");
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByLabelText("已选角色")).toBeEmptyDOMElement();
  });

  it("移除标签不会提交外层表单", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SelectorForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole("combobox", { name: "角色" }));
    await user.click(await screen.findByRole("option", { name: "账务管理员" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByLabelText("已选角色")).toBeEmptyDOMElement();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("键盘激活移除按钮只移除一次", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultipleSelector
        value={[{ value: "role-001", label: "账务管理员" }]}
        onChange={onChange}
        inputProps={{ "aria-label": "角色" }}
      />,
    );

    const remove = screen.getByRole("button", { name: "Remove" });
    remove.focus();
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
