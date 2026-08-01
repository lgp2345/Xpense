import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrganizationSwitcher } from "./organization-switcher";
import styles from "./organization-switcher.module.css";

describe("OrganizationSwitcher", () => {
  it("selects another organization through the accessible listbox", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();

    render(
      <OrganizationSwitcher
        currentOrganizationId="org-1"
        organizations={[
          { id: "org-1", name: "个人账本" },
          { id: "org-2", name: "家庭账本" },
        ]}
        onSwitch={onSwitch}
      />,
    );

    await user.click(screen.getByRole("button", { name: /当前组织/ }));
    await user.click(screen.getByRole("option", { name: "家庭账本" }));

    expect(onSwitch).toHaveBeenCalledWith("org-2");
  });

  it("keeps a long organization option inside a 44px touch target", async () => {
    const user = userEvent.setup();
    const longName = "这是一个没有空格且需要在弹出列表中安全截断的超长组织名称测试文本";

    render(
      <OrganizationSwitcher
        currentOrganizationId="org-1"
        organizations={[
          { id: "org-1", name: "个人账本" },
          { id: "org-2", name: longName },
        ]}
        onSwitch={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /当前组织/ }));

    const option = screen.getByRole("option", { name: longName });
    const optionText = within(option).getByText(longName);
    const { option: optionClass, optionText: optionTextClass } = styles;

    if (!optionClass || !optionTextClass) {
      throw new Error("Expected organization switcher CSS module classes");
    }

    expect(option).toContainElement(optionText);
    expect(optionText.tagName).toBe("SPAN");
    expect(option).toHaveClass(optionClass);
    expect(optionText).toHaveClass(optionTextClass);
    expect(optionText).toHaveAttribute("title", longName);
  });
});
