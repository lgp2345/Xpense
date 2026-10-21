import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import { BillingPeriodSelect } from "./billing-period-select";

const periods = Array.from({ length: 52 }, (_, index) => {
  const month = `${2026 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  return { periodStart: `${month}-01`, periodEnd: `${month}-28` };
});

function Example() {
  const [value, setValue] = useState("2026-01-01");
  return (
    <BillingPeriodSelect periods={periods} value={value} disabled={false} onChange={setValue} />
  );
}

function scrollToEnd(list: HTMLElement) {
  const height = screen.getAllByRole("option").length * 32;
  Object.defineProperties(list, {
    clientHeight: { configurable: true, value: 256 },
    scrollHeight: { configurable: true, value: height },
  });
  fireEvent.scroll(list, { target: { scrollTop: height - 256 } });
}

it("连续滚动分批追加账期，加载完毕后不重复选项", async () => {
  const user = userEvent.setup();
  render(<Example />);
  await user.click(screen.getByRole("combobox", { name: "出账账期" }));
  const list = await screen.findByRole("listbox");
  expect(screen.getAllByRole("option")).toHaveLength(20);
  scrollToEnd(list);
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(40));
  scrollToEnd(list);
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(52));
  scrollToEnd(list);
  expect(screen.getAllByRole("option")).toHaveLength(52);
  expect(screen.getByRole("option", { name: "2026-01-01 至 2026-01-28" })).toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: "2030-04-01 至 2030-04-28" }));
  expect(screen.getByRole("combobox", { name: "出账账期" })).toHaveTextContent("2030-04-01");
});

it.each(["鼠标", "键盘"])("%s打开后用End可直接选中尚未滚动加载的末期", async (method) => {
  const user = userEvent.setup();
  render(<Example />);
  if (method === "鼠标") {
    await user.click(screen.getByRole("combobox", { name: "出账账期" }));
  } else {
    await user.tab();
    await user.keyboard("{ArrowDown}");
  }
  await screen.findByRole("listbox");
  await user.keyboard("{End}");
  const last = await screen.findByRole("option", { name: "2030-04-01 至 2030-04-28" });
  await waitFor(() => expect(last).toHaveFocus());
  await user.keyboard("{Enter}");
  expect(screen.getByRole("combobox", { name: "出账账期" })).toHaveTextContent("2030-04-01");
});
