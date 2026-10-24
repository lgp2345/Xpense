import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { expect, it, vi } from "vitest";
import { Field, FieldLabel } from "./field";
import { Input } from "./input";

it("preserves an explicit accessible name inside a field", () => {
  render(
    <Field>
      <FieldLabel>房产名称</FieldLabel>
      <Input aria-label="筛选房产" />
    </Field>,
  );
  expect(screen.getByRole("textbox", { name: "筛选房产" })).toBeInTheDocument();
});

it("preserves controlled input events, refs and focus", async () => {
  const user = userEvent.setup();
  const inputRef = createRef<HTMLInputElement>();
  const onBlur = vi.fn();
  function Example() {
    const [value, setValue] = useState("");
    return (
      <Field>
        <Input
          aria-label="姓名"
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={onBlur}
        />
      </Field>
    );
  }
  render(<Example />);
  const input = screen.getByRole("textbox", { name: "姓名" });
  expect(inputRef.current).toBe(input);
  await user.type(input, "张三");
  expect(input).toHaveValue("张三");
  expect(input).toHaveFocus();
  await user.tab();
  expect(onBlur).toHaveBeenCalledTimes(1);
});
