import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaptchaField } from "./captcha-field";

describe("CaptchaField", () => {
  it("keeps a light background behind transparent captcha SVGs", () => {
    render(
      <CaptchaField
        error={null}
        loading={false}
        onRefresh={vi.fn()}
        svg='<svg aria-hidden="true"></svg>'
      />,
    );

    const captchaImage = screen.getByRole("img", { name: "验证码" });
    expect(captchaImage.parentElement).toHaveClass("bg-white");
  });
});
