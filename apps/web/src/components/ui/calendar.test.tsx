import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Calendar } from "./calendar";

function CalendarHarness() {
  const [month, setMonth] = useState(new Date(2024, 5));
  return (
    <Calendar
      mode="single"
      captionLayout="dropdown"
      startMonth={new Date(2024, 5)}
      endMonth={new Date(2025, 8)}
      month={month}
      onMonthChange={setMonth}
      formatters={{ formatMonthDropdown: (date) => `${date.getMonth() + 1}月` }}
    />
  );
}

describe("Calendar dropdowns", () => {
  it("keeps month boundary options disabled and year options within the date range", async () => {
    const user = userEvent.setup();
    render(<CalendarHarness />);

    const month = screen.getByRole("combobox", { name: "Choose the Month" });
    await user.click(month);
    const monthOptions = await screen.findByRole("listbox");
    expect(within(monthOptions).getByRole("option", { name: "1月" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(monthOptions).getByRole("option", { name: "6月" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.keyboard("{Escape}");

    const year = screen.getByRole("combobox", { name: "Choose the Year" });
    await user.click(year);
    const yearOptions = await screen.findByRole("listbox");
    expect(within(yearOptions).getByRole("option", { name: "2024" })).toBeInTheDocument();
    expect(within(yearOptions).getByRole("option", { name: "2025" })).toBeInTheDocument();
    expect(within(yearOptions).queryByRole("option", { name: "2023" })).not.toBeInTheDocument();
    await user.click(within(yearOptions).getByRole("option", { name: "2025" }));

    await user.click(screen.getByRole("combobox", { name: "Choose the Month" }));
    const endMonthOptions = await screen.findByRole("listbox");
    expect(within(endMonthOptions).getByRole("option", { name: "10月" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(endMonthOptions).getByRole("option", { name: "9月" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
