import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PageTabs } from "./page-tabs";

const tabs = [
  { href: "/members", identity: "Members:{}", title: "成员管理" },
  { href: "/roles", identity: "Roles:{}", title: "角色管理" },
] as const;

describe("PageTabs", () => {
  it("marks the active page and delegates switching and closing", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onClose = vi.fn();

    render(
      <PageTabs
        activeIdentity="Members:{}"
        onActivate={onActivate}
        onClose={onClose}
        tabs={tabs}
      />,
    );

    expect(screen.getByRole("navigation", { name: "已打开页面" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "成员管理" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(screen.getByRole("button", { name: "角色管理" }));
    await user.click(screen.getByRole("button", { name: "关闭“成员管理”" }));

    expect(onActivate).toHaveBeenCalledWith("Roles:{}");
    expect(onClose).toHaveBeenCalledWith("Members:{}");
  });

  it("prevents closing the last remaining page", () => {
    render(
      <PageTabs
        activeIdentity="Members:{}"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        tabs={[tabs[0]]}
      />,
    );

    expect(screen.getByRole("button", { name: "关闭“成员管理”" })).toBeDisabled();
  });

  it("does not render an empty navigation landmark", () => {
    render(<PageTabs activeIdentity={null} onActivate={vi.fn()} onClose={vi.fn()} tabs={[]} />);

    expect(screen.queryByRole("navigation", { name: "已打开页面" })).not.toBeInTheDocument();
  });

  it("keeps the active tab visible when selection changes", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const view = render(
      <PageTabs activeIdentity="Members:{}" onActivate={vi.fn()} onClose={vi.fn()} tabs={tabs} />,
    );

    view.rerender(
      <PageTabs activeIdentity="Roles:{}" onActivate={vi.fn()} onClose={vi.fn()} tabs={tabs} />,
    );

    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", inline: "nearest" });
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });
});
