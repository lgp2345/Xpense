import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionTreeNode } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import { PermissionTree } from "./permission-tree";

const permissionTree: PermissionTreeNode[] = [
  {
    id: 1,
    parentId: null,
    type: "directory",
    name: "系统管理",
    permissionCode: null,
    children: [
      {
        id: 2,
        parentId: 1,
        type: "menu",
        name: "角色管理",
        permissionCode: "roles:read",
        children: [],
      },
    ],
  },
];

describe("PermissionTree", () => {
  it("collapses and expands a node's children independently", async () => {
    const user = userEvent.setup();

    render(<PermissionTree nodes={permissionTree} selected={[]} onChange={vi.fn()} />);

    const collapseButton = screen.getByRole("button", { name: "折叠 系统管理" });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    expect(collapseButton.querySelector("svg")).toHaveClass(
      "group-data-[state=open]/permission-toggle:rotate-90",
      "duration-200",
      "ease-out",
    );
    expect(screen.getByRole("checkbox", { name: "角色管理" })).toBeInTheDocument();

    await user.click(collapseButton);

    expect(screen.getByRole("button", { name: "展开 系统管理" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("checkbox", { name: "角色管理" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开 系统管理" }));

    expect(screen.getByRole("checkbox", { name: "角色管理" })).toBeInTheDocument();
  });
});
