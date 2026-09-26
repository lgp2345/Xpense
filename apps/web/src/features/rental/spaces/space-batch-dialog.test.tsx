import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SpaceBatchDialog } from "./space-batch-dialog";

describe("SpaceBatchDialog feedback", () => {
  it("shows parsing and conditional required errors beneath the relevant controls", async () => {
    const user = userEvent.setup();
    render(<SpaceBatchDialog propertyId="property-1" onCreate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "批量新增" }));
    const lines = screen.getByRole("textbox", { name: "空间列表" });

    await user.type(lines, "101,房间一\n101,房间二");
    expect(lines.closest('[data-slot="field"]')).toHaveTextContent("第 2 行");
    expect(lines).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("combobox", { name: "批量空间类型" }));
    await user.click(screen.getByRole("option", { name: "其他" }));
    const custom = screen.getByLabelText("自定义类型");
    expect(custom.parentElement?.lastElementChild).toHaveTextContent("请输入自定义类型");
    await user.type(custom, "工作室");
    expect(screen.queryByText("请输入自定义类型")).not.toBeInTheDocument();
  });
});
