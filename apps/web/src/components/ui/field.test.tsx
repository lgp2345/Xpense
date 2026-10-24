import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DateRangePicker } from "../date-range-picker";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "./field";
import { Input } from "./input";

describe("shadcn field", () => {
  it("keeps nested date-range calendar and time controls independently labelled", async () => {
    const user = userEvent.setup();
    render(
      <Field>
        <FieldLabel htmlFor="lease-range">租期范围</FieldLabel>
        <DateRangePicker
          id="lease-range"
          aria-label="租期范围"
          withTime
          value={{ from: "2026-10-01T08:00:00", to: "2026-10-31T18:00:00" }}
          onChange={() => {}}
        />
      </Field>,
    );
    await user.click(screen.getByRole("button", { name: "租期范围" }));
    const start = await screen.findByLabelText("开始时间");
    const end = screen.getByLabelText("结束时间");
    expect(start.tagName).toBe("INPUT");
    expect(end.tagName).toBe("INPUT");
    expect(start.id).not.toBe(end.id);
    expect(start).toHaveValue("08:00:00");
    expect(end).toHaveValue("18:00:00");
  });

  it("keeps independent control ids and labels when a field groups multiple inputs", async () => {
    const user = userEvent.setup();
    render(
      <Field>
        <FieldLabel htmlFor="group-from">开始时间</FieldLabel>
        <Input id="group-from" />
        <FieldLabel htmlFor="group-to">结束时间</FieldLabel>
        <Input id="group-to" />
      </Field>,
    );
    const start = screen.getByRole("textbox", { name: "开始时间" });
    const end = screen.getByRole("textbox", { name: "结束时间" });
    expect(start.id).toBe("group-from");
    expect(end.id).toBe("group-to");
    await user.click(screen.getByText("结束时间"));
    expect(end).toHaveFocus();
  });

  it("keeps explicit fieldset names and propagates disabled state", () => {
    render(
      <FieldSet aria-label="已选空间" disabled>
        <FieldLegend>已选空间 1</FieldLegend>
        <Field>
          <FieldLabel htmlFor="space-note">空间备注</FieldLabel>
          <Input id="space-note" />
        </Field>
      </FieldSet>,
    );
    expect(screen.getByRole("group", { name: "已选空间" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "空间备注" })).toBeDisabled();
  });

  it("preserves explicit labels and descriptions with a Base UI input", async () => {
    const user = userEvent.setup();
    render(
      <Field>
        <FieldLabel htmlFor="contact-email">联系邮箱</FieldLabel>
        <Input id="contact-email" aria-describedby="contact-email-help" />
        <FieldDescription id="contact-email-help">用于账单通知</FieldDescription>
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "联系邮箱" });
    expect(input).toHaveAccessibleDescription("用于账单通知");
    await user.click(screen.getByText("联系邮箱"));
    expect(input).toHaveFocus();
  });

  it("preserves externally controlled errors and disabled controls", () => {
    render(
      <Field data-invalid>
        <FieldLabel htmlFor="disabled-email">禁用邮箱</FieldLabel>
        <Input id="disabled-email" aria-invalid aria-describedby="disabled-email-error" disabled />
        <FieldError id="disabled-email-error">邮箱已停用</FieldError>
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "禁用邮箱" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("邮箱已停用");
    expect(input).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("邮箱已停用");
  });

  it("keeps standalone labels, descriptions and server errors usable outside a field", () => {
    render(
      <>
        <FieldLabel htmlFor="standalone">独立筛选</FieldLabel>
        <Input id="standalone" />
        <FieldDescription>筛选说明</FieldDescription>
        <FieldError>服务器返回的错误</FieldError>
      </>,
    );
    expect(screen.getByRole("textbox", { name: "独立筛选" })).toBeInTheDocument();
    expect(screen.getByText("筛选说明")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("服务器返回的错误");
  });

  it("renders labels, descriptions and conditional errors with invalid state", () => {
    const view = render(
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">邮箱</FieldLabel>
          <input id="email" />
          <FieldDescription>用于联系</FieldDescription>
          <FieldError />
        </Field>
      </FieldGroup>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    view.rerender(
      <Field data-invalid>
        <FieldLabel htmlFor="email">邮箱</FieldLabel>
        <input id="email" aria-invalid aria-describedby="email-error" />
        <FieldError
          id="email-error"
          errors={[
            { message: "邮箱格式错误" },
            { message: "邮箱格式错误" },
            { message: "请输入工作邮箱" },
          ]}
        />
      </Field>,
    );
    expect(screen.getAllByText("邮箱格式错误")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("请输入工作邮箱");
    expect(screen.getByLabelText("邮箱").closest('[data-slot="field"]')).toHaveAttribute(
      "data-invalid",
      "true",
    );
  });
});
