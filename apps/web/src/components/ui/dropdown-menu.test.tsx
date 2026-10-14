import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

it("activates menu actions with the keyboard", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button>操作</Button>} />
      <DropdownMenuContent>
        <DropdownMenuItem onClick={onSelect}>编辑</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  await user.tab();
  await user.keyboard("{Enter}");
  const item = await screen.findByRole("menuitem", { name: "编辑" });
  await waitFor(() => expect(item).toHaveFocus());
  await user.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
});

function VisibilityMenu() {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <p>{checked ? "名称可见" : "名称隐藏"}</p>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button>列显隐</Button>} />
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked}>
            名称
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

it("updates a checkbox item and retains the existing close-on-selection behavior", async () => {
  const user = userEvent.setup();
  render(<VisibilityMenu />);
  await user.click(screen.getByRole("button", { name: "列显隐" }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "名称" }));
  expect(screen.getByText("名称可见")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
});
