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

  it("allows closing the last remaining page", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <PageTabs
        activeIdentity="Members:{}"
        onActivate={vi.fn()}
        onClose={onClose}
        tabs={[tabs[0]]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "关闭“成员管理”" }));

    expect(onClose).toHaveBeenCalledWith("Members:{}");
  });

  it("renders no tab strip or spacer when there are no tabs", () => {
    const { container } = render(
      <PageTabs activeIdentity={null} onActivate={vi.fn()} onClose={vi.fn()} tabs={[]} />,
    );

    expect(screen.queryByRole("navigation", { name: "已打开页面" })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the active tab visible without scrolling the document", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const view = render(
      <PageTabs activeIdentity="Members:{}" onActivate={vi.fn()} onClose={vi.fn()} tabs={tabs} />,
    );
    const navigation = screen.getByRole("navigation", { name: "已打开页面" });
    const rolesTab = screen.getByRole("button", { name: "角色管理" }).parentElement;

    Object.defineProperty(navigation, "scrollLeft", {
      configurable: true,
      value: 0,
      writable: true,
    });
    navigation.getBoundingClientRect = () => createRect(0, 100);
    if (!rolesTab) throw new Error("角色管理标签容器不存在");
    rolesTab.getBoundingClientRect = () => createRect(120, 200);

    view.rerender(
      <PageTabs activeIdentity="Roles:{}" onActivate={vi.fn()} onClose={vi.fn()} tabs={tabs} />,
    );

    expect(navigation.scrollLeft).toBe(100);
    expect(scrollIntoView).not.toHaveBeenCalled();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });
});

function createRect(left: number, right: number): DOMRect {
  return {
    bottom: 40,
    height: 40,
    left,
    right,
    top: 0,
    width: right - left,
    x: left,
    y: 0,
    toJSON: () => ({}),
  };
}
