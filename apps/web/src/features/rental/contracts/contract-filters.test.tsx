import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContractFilters } from "./contract-filters";

describe("contract date filters", () => {
  it("opens the status filter as an accessible select popup and submits its value", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ContractFilters search={{}} onApply={onApply} />);

    await user.click(screen.getByRole("combobox", { name: "合同状态" }));
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "进行中" }));
    await user.click(screen.getByRole("button", { name: "应用筛选" }));

    expect(onApply).toHaveBeenLastCalledWith({ status: "active", page: 1, pageSize: 20 });
  });

  it("maps one lease range to contract start and end query fields", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ContractFilters
        search={{
          startDateFrom: "2026-08-01",
          endDateTo: "2027-07-31",
        }}
        onApply={onApply}
      />,
    );
    expect(screen.getByRole("button", { name: "租期范围" })).toHaveTextContent(
      "2026-08-01 - 2027-07-31",
    );
    expect(screen.queryByRole("button", { name: "开始日期范围" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "结束日期范围" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "应用筛选" }));
    expect(onApply).toHaveBeenLastCalledWith({
      startDateFrom: "2026-08-01",
      endDateTo: "2027-07-31",
      page: 1,
      pageSize: 20,
    });
    await user.click(screen.getByRole("button", { name: "清空" }));
    expect(onApply).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });
  });

  it("restores date ranges when URL search changes", () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <ContractFilters search={{ endDateTo: "2026-12-31" }} onApply={onApply} />,
    );
    expect(screen.getByRole("button", { name: "租期范围" })).toHaveTextContent("- 2026-12-31");
    rerender(<ContractFilters search={{}} onApply={onApply} />);
    expect(screen.getByRole("button", { name: "租期范围" })).toHaveTextContent("选择租期范围");
  });
});

it("selects both lease bounds in one picker and preserves URL date format", async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  render(<ContractFilters search={{ startDateFrom: "2026-10-05" }} onApply={onApply} />);
  await user.click(screen.getByRole("button", { name: "租期范围" }));
  await screen.findByRole("grid");
  const day = screen
    .getAllByRole("button")
    .find((button) => button.dataset.day === new Date(2026, 9, 15).toLocaleDateString());
  expect(day).toBeDefined();
  await user.click(day as HTMLButtonElement);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "应用筛选" }));
  expect(onApply).toHaveBeenLastCalledWith({
    startDateFrom: "2026-10-05",
    endDateTo: "2026-10-15",
    page: 1,
    pageSize: 20,
  });
});
