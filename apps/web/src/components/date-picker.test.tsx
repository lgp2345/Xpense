import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DatePickerInput, DateRangePicker, type DateRangeValue } from "./date-picker";

function Harness({ initial = "2024-02-29", withTime = false }) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <DatePickerInput aria-label="日期" value={value} onChange={setValue} withTime={withTime} />
  );
}

function RangeHarness() {
  const [value, setValue] = useState<DateRangeValue>({ from: "2024-02-01" });
  return (
    <DateRangePicker
      aria-label="账期范围"
      value={value}
      onChange={setValue}
      placeholder="选择账期"
    />
  );
}

describe("DatePickerInput", () => {
  it("accepts ISO dates without timezone conversion", () => {
    const onChange = vi.fn();
    render(<DatePickerInput aria-label="日期" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("日期"), { target: { value: "2024-02-29" } });
    expect(onChange).toHaveBeenLastCalledWith("2024-02-29");
  });

  it("rejects invalid calendar dates, restores on blur and clears the value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePickerInput aria-label="日期" value="2024-02-29" onChange={onChange} />);
    const input = screen.getByLabelText("日期");
    fireEvent.change(input, { target: { value: "2025/02/29" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(input).toHaveValue("2024/02/29");
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("opens a localized calendar by keyboard, changes years and selects a day", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("日期");
    input.focus();
    await user.keyboard("{ArrowDown}");
    const selects = await screen.findAllByRole("combobox");
    expect(selects).toHaveLength(2);
    const year = selects.find((select) => (select as HTMLSelectElement).value === "2024");
    expect(year).toBeDefined();
    await user.selectOptions(year as HTMLSelectElement, "2023");
    const day = screen
      .getAllByRole("button")
      .find((button) => button.dataset.day === new Date(2023, 1, 15).toLocaleDateString());
    await user.click(day as HTMLButtonElement);
    expect(input).toHaveValue("2023/02/15");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves local time when selecting a different date", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2024-02-29T16:30" withTime />);
    expect(screen.getByLabelText("日期")).toHaveValue("2024/02/29 16:30");
    await user.click(screen.getByRole("button", { name: "选择日期" }));
    await screen.findByRole("grid");
    const day = screen
      .getAllByRole("button")
      .find((button) => button.dataset.day === new Date(2024, 1, 15).toLocaleDateString());
    await user.click(day as HTMLButtonElement);
    expect(screen.getByLabelText("日期")).toHaveValue("2024/02/15 16:30");
  });

  it("respects disabled state and forwards field blur", async () => {
    const onBlur = vi.fn();
    render(<DatePickerInput aria-label="日期" disabled onBlur={onBlur} />);
    expect(screen.getByLabelText("日期")).toBeDisabled();
    expect(screen.getByRole("button", { name: "选择日期" })).toBeDisabled();
    fireEvent.blur(screen.getByLabelText("日期"));
    expect(onBlur).toHaveBeenCalledOnce();
  });
  it("edits time without changing the date and supports external resets", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness initial="2024-02-29T16:30" withTime />);
    await user.click(screen.getByRole("button", { name: "选择日期" }));
    await screen.findByRole("grid");
    fireEvent.change(screen.getByLabelText("时间"), { target: { value: "00:15" } });
    expect(screen.getByLabelText("日期")).toHaveValue("2024/02/29 00:15");
    rerender(<DatePickerInput aria-label="日期" value="2030-01-01" />);
    expect(screen.getByLabelText("日期")).toHaveValue("2030/01/01");
    rerender(<DatePickerInput aria-label="日期" value="" />);
    expect(screen.getByLabelText("日期")).toHaveValue("");
  });
});

describe("DateRangePicker", () => {
  it("selects a date range and emits canonical ISO dates", async () => {
    const user = userEvent.setup();
    render(<RangeHarness />);

    const trigger = screen.getByRole("button", { name: "账期范围" });
    expect(trigger).toHaveTextContent("2024/02/01 -");
    await user.click(trigger);
    await screen.findByRole("grid");
    const endDay = screen
      .getAllByRole("button")
      .find((button) => button.dataset.day === new Date(2024, 1, 15).toLocaleDateString());
    await user.click(endDay as HTMLButtonElement);

    expect(trigger).toHaveTextContent("2024/02/01 - 2024/02/15");
  });

  it("shows both open range bounds and follows external resets", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DateRangePicker
        aria-label="账期范围"
        value={{ to: "2026-12-31" }}
        onChange={onChange}
        placeholder="选择账期"
      />,
    );
    expect(screen.getByRole("button", { name: "账期范围" })).toHaveTextContent("- 2026/12/31");

    rerender(
      <DateRangePicker
        aria-label="账期范围"
        value={{}}
        onChange={onChange}
        placeholder="选择账期"
      />,
    );
    expect(screen.getByRole("button", { name: "账期范围" })).toHaveTextContent("选择账期");
  });
});
