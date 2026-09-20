import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContractFilters } from "./contract-filters";

describe("contract date filters", () => {
  it("uses calendar inputs and preserves independent open date bounds", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ContractFilters search={{}} onApply={onApply} />);
    expect(screen.getAllByRole("button", { name: /^选择.*日期/ })).toHaveLength(4);
    fireEvent.change(screen.getByLabelText("开始日期（从）"), { target: { value: "2026/08/01" } });
    await user.click(screen.getByRole("button", { name: "应用筛选" }));
    expect(onApply).toHaveBeenLastCalledWith({
      startDateFrom: "2026-08-01",
      page: 1,
      pageSize: 20,
    });
    await user.click(screen.getByRole("button", { name: "清空" }));
    expect(onApply).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });
  });

  it("restores dates when URL search changes", () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <ContractFilters search={{ endDateTo: "2026-12-31" }} onApply={onApply} />,
    );
    expect(screen.getByLabelText("结束日期（至）")).toHaveValue("2026/12/31");
    rerender(<ContractFilters search={{}} onApply={onApply} />);
    expect(screen.getByLabelText("结束日期（至）")).toHaveValue("");
  });
});
