import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Field, FieldLabel } from "./field";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("preserves aria-label over the Field label unless aria-labelledby is explicit", () => {
    render(
      <>
        <Field>
          <FieldLabel htmlFor="aria-label-textarea">表单字段标签</FieldLabel>
          <Textarea id="aria-label-textarea" aria-label="备注的自定义名称" />
        </Field>
        <Field>
          <FieldLabel htmlFor="aria-labelledby-textarea">另一个表单标签</FieldLabel>
          <Textarea
            id="aria-labelledby-textarea"
            aria-label="备用名称"
            aria-labelledby="textarea-explicit-name"
          />
          <span id="textarea-explicit-name">明确指定的名称</span>
        </Field>
      </>,
    );

    expect(screen.getByRole("textbox", { name: "备注的自定义名称" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "明确指定的名称" })).toBeInTheDocument();
  });

  it("keeps native props, ref focus, controlled typing, and newlines", async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();

    function ControlledTextarea() {
      const [value, setValue] = useState("");
      return (
        <Textarea
          ref={ref}
          aria-label="补充说明"
          aria-invalid
          aria-describedby="note-error"
          rows={3}
          maxLength={20}
          value={value}
          onChange={(event) => {
            onChange(event);
            setValue(event.currentTarget.value);
          }}
        />
      );
    }

    render(
      <>
        <ControlledTextarea />
        <p id="note-error">请补充说明</p>
      </>,
    );

    const textarea = screen.getByRole("textbox", { name: "补充说明" });
    expect(textarea).toHaveAttribute("rows", "3");
    expect(textarea).toHaveAttribute("maxlength", "20");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveAttribute("aria-describedby", "note-error");
    expect(ref.current).toBe(textarea);

    ref.current?.focus();
    expect(textarea).toHaveFocus();

    await user.type(textarea, "first line{enter}second");
    expect(textarea).toHaveValue("first line\nsecond");
    expect(onChange).toHaveBeenCalled();
  });

  it("remains uneditable inside a disabled fieldset", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <fieldset disabled>
        <Textarea aria-label="备注" onChange={onChange} />
      </fieldset>,
    );

    const textarea = screen.getByRole("textbox", { name: "备注" });
    expect(textarea).toBeDisabled();
    await user.type(textarea, "不能输入");
    expect(textarea).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });
});
