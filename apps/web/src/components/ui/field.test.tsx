import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./field";

describe("shadcn field", () => {
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
