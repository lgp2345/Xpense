import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function Example() {
  return (
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">甲</TabsTrigger>
        <TabsTrigger value="b">乙</TabsTrigger>
      </TabsList>
      <TabsContent value="a">
        <input aria-label="名称" />
      </TabsContent>
      <TabsContent value="b">乙的内容</TabsContent>
    </Tabs>
  );
}

it("activates the next tab when arrow keys move focus", async () => {
  const user = userEvent.setup();
  render(<Example />);
  await user.tab();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "乙" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("乙的内容");
});

it("unmounts inactive panels so their local input state resets", async () => {
  const user = userEvent.setup();
  render(<Example />);
  await user.type(screen.getByRole("textbox", { name: "名称" }), "临时输入");
  await user.click(screen.getByRole("tab", { name: "乙" }));
  expect(screen.queryByRole("textbox", { name: "名称" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "甲" }));
  expect(screen.getByRole("textbox", { name: "名称" })).toHaveValue("");
});
