import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import { Field, FieldLabel } from "./field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

it("keeps an explicit trigger name instead of replacing it with the field label", () => {
  render(
    <Field>
      <FieldLabel>空间类型</FieldLabel>
      <Select value="room">
        <SelectTrigger aria-label="批量空间类型">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="room">房间</SelectItem>
        </SelectContent>
      </Select>
    </Field>,
  );
  expect(screen.getByRole("combobox", { name: "批量空间类型" })).toHaveTextContent("房间");
});

function Example({ initial = "a" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger aria-label="状态">
        <SelectValue placeholder="请选择" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">有效</SelectItem>
        <SelectItem value="b">停用</SelectItem>
      </SelectContent>
    </Select>
  );
}

it("displays the selected item's label before opening the popup", () => {
  render(<Example />);
  expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent(/^有效$/);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

it("opens an already selected value with one mouse click", async () => {
  const user = userEvent.setup();
  render(<Example />);
  await user.click(screen.getByRole("combobox", { name: "状态" }));
  expect(await screen.findByRole("option", { name: "停用" })).toBeInTheDocument();
});

it("preserves the empty placeholder and allows keyboard selection", async () => {
  const user = userEvent.setup();
  render(<Example initial="" />);
  expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("请选择");
  await user.tab();
  await user.keyboard("{ArrowDown}");
  const firstOption = await screen.findByRole("option", { name: "有效" });
  await waitFor(() => expect(firstOption).toHaveFocus());
  await user.keyboard("{End}");
  await waitFor(() => expect(screen.getByRole("option", { name: "停用" })).toHaveFocus());
  await user.keyboard("{Enter}");
  expect(screen.getByRole("combobox", { name: "状态" })).toHaveTextContent("停用");
});
