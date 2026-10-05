import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateRangePicker, type DateRangeValue } from "./date-range-picker";

function Harness({
  initial = { from: "2026-10-05T09:12:34", to: "2026-11-04T18:56:07" },
  withTime = true,
}: {
  initial?: DateRangeValue;
  withTime?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DateRangePicker
      aria-label="日期时间范围"
      value={value}
      onChange={setValue}
      withTime={withTime}
      showDurationPresets
    />
  );
}

describe("DateRangePicker time selection", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ["一个月", "2026/11/04"],
    ["三个月", "2027/01/04"],
    ["半年", "2027/04/04"],
    ["一年", "2027/10/04"],
    ["两年", "2028/10/04"],
    ["三年", "2029/10/04"],
  ] as const)("selects %s with inclusive second precision and resets custom times", async (label, end) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 5, 23, 30, 45));
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "日期时间范围" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: label }));

    expect(trigger).toHaveTextContent(`2026/10/05 00:00:00 - ${end} 23:59:59`);
    expect(screen.getByLabelText("开始时间")).toHaveValue("00:00:00");
    expect(screen.getByLabelText("结束时间")).toHaveValue("23:59:59");
  });

  it("edits each bound independently down to seconds without converting its local date", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "日期时间范围" });
    await user.click(trigger);
    expect(screen.getByLabelText("开始时间")).toHaveAttribute("step", "1");
    expect(screen.getByLabelText("结束时间")).toHaveAttribute("step", "1");
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "01:02:03" } });
    expect(trigger).toHaveTextContent("2026/10/05 01:02:03 - 2026/11/04 18:56:07");
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "22:23:24" } });
    expect(trigger).toHaveTextContent("2026/10/05 01:02:03 - 2026/11/04 22:23:24");
  });

  it("preserves edited times when the calendar end date changes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "日期时间范围" }));
    await screen.findByRole("grid");
    const endDay = screen
      .getAllByRole("button")
      .find((button) => button.dataset.day === new Date(2026, 9, 15).toLocaleDateString());
    await user.click(endDay as HTMLButtonElement);
    expect(screen.getByRole("button", { name: "日期时间范围" })).toHaveTextContent(
      "2026/10/05 09:12:34 - 2026/10/15 18:56:07",
    );
  });

  it("accepts date-only initial values and adds default times when the range is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateRangePicker
        aria-label="租期"
        withTime
        value={{ from: "2026-10-05" }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "租期" }));
    await screen.findByRole("grid");
    expect(screen.getByLabelText("开始时间")).toHaveValue("00:00:00");
    expect(screen.getByLabelText("结束时间")).toHaveValue("23:59:59");
    expect(screen.getByLabelText("结束时间")).toBeDisabled();
    const endDay = screen
      .getAllByRole("button")
      .find((button) => button.dataset.day === new Date(2026, 9, 15).toLocaleDateString());
    await user.click(endDay as HTMLButtonElement);
    expect(onChange).toHaveBeenLastCalledWith({
      from: "2026-10-05T00:00:00",
      to: "2026-10-15T23:59:59",
    });
  });

  it("rejects inverted times within the same day and explains the problem", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateRangePicker
        aria-label="租期"
        withTime
        value={{ from: "2026-10-05T09:00:00", to: "2026-10-05T10:00:00" }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "租期" }));
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "11:00:00" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("结束时间不能早于开始时间");
    expect(screen.getByLabelText("开始时间")).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "08:00:00" } });
    expect(onChange).toHaveBeenLastCalledWith({
      from: "2026-10-05T08:00:00",
      to: "2026-10-05T10:00:00",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not emit empty or invalid time values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateRangePicker
        aria-label="租期"
        withTime
        value={{ from: "2026-10-05", to: "2026-11-04" }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "租期" }));
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "25:61:90" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reflects external resets and disables time inputs when dates are cleared", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DateRangePicker
        aria-label="租期"
        withTime
        value={{ from: "2026-10-05T12:34:56", to: "2026-11-04T23:00:01" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "租期" }));
    rerender(
      <DateRangePicker
        aria-label="租期"
        withTime
        value={{ from: "2026-12-01", to: "2027-01-01" }}
      />,
    );
    expect(screen.getByLabelText("开始时间")).toHaveValue("00:00:00");
    expect(screen.getByLabelText("结束时间")).toHaveValue("23:59:59");
    rerender(<DateRangePicker aria-label="租期" withTime value={{}} />);
    expect(screen.getByLabelText("开始时间")).toBeDisabled();
    expect(screen.getByLabelText("结束时间")).toBeDisabled();
  });

  it("keeps time selection opt-in and preserves date-only callbacks", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 5));
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateRangePicker aria-label="租期" showDurationPresets onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "租期" }));
    expect(screen.queryByLabelText("开始时间")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "一个月" }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-10-05", to: "2026-11-04" });
  });

  it("prevents opening a disabled picker with time selection enabled", async () => {
    const user = userEvent.setup();
    render(<DateRangePicker aria-label="租期" withTime disabled />);
    await user.click(screen.getByRole("button", { name: "租期" }));
    expect(screen.getByRole("button", { name: "租期" })).toBeDisabled();
    expect(screen.queryByLabelText("开始时间")).not.toBeInTheDocument();
  });
});
