import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

it("shows its description on keyboard focus and dismisses it with Escape", async () => {
  const user = userEvent.setup();
  render(
    <Tooltip>
      <TooltipTrigger render={<Button>帮助</Button>} />
      <TooltipContent>操作说明</TooltipContent>
    </Tooltip>,
  );
  await user.tab();
  const description = await screen.findByText("操作说明");
  expect(description).toBeVisible();
  expect(description).toHaveAttribute("role", "tooltip");
  expect(screen.getByRole("button", { name: "帮助" })).toHaveAccessibleDescription("操作说明");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
