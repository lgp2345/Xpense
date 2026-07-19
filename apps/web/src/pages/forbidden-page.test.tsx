import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ForbiddenPage } from "./forbidden-page";

describe("ForbiddenPage", () => {
  it("explains the permission boundary and provides a keyboard-accessible return action", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<ForbiddenPage onBack={onBack} />);

    expect(screen.getByRole("heading", { name: "无权限访问" })).toBeInTheDocument();
    const backButton = screen.getByRole("button", { name: "返回首页" });
    backButton.focus();
    await user.keyboard("{Enter}");

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
