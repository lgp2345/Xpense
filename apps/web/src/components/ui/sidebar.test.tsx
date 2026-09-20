import { act, fireEvent, render, screen } from "@testing-library/react";

import { SidebarProvider, useSidebar } from "./sidebar";

function SidebarStateProbe() {
  const { state } = useSidebar();

  return (
    <>
      <input aria-label="月租" />
      <output aria-label="侧栏状态">{state}</output>
    </>
  );
}

function renderSidebar() {
  render(
    <SidebarProvider>
      <SidebarStateProbe />
    </SidebarProvider>,
  );
}

describe("SidebarProvider keyboard shortcut", () => {
  it("ignores editable-control keydown events without a key value", () => {
    renderSidebar();

    const input = screen.getByRole("textbox", { name: "月租" });
    act(() => {
      input.dispatchEvent(new Event("keydown", { bubbles: true }));
    });

    expect(screen.getByRole("status", { name: "侧栏状态" })).toHaveTextContent("expanded");
  });

  it("does not toggle the sidebar shortcut while editing an input", () => {
    renderSidebar();

    fireEvent.keyDown(screen.getByRole("textbox", { name: "月租" }), {
      key: "b",
      ctrlKey: true,
    });

    expect(screen.getByRole("status", { name: "侧栏状态" })).toHaveTextContent("expanded");
  });
});
