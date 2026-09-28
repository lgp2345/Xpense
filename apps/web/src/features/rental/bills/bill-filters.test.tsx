import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { BillFilters, validateRentalBillsSearch } from "./bill-filters";

it("解析分页/费用/日期，拒绝非法日期和枚举", () => {
  expect(
    validateRentalBillsSearch({
      page: "2",
      pageSize: "100",
      status: "voided",
      type: "deposit",
      dueDateFrom: "2026-02-29",
      dueDateTo: "2026-03-01",
      keyword: " RC ",
    }),
  ).toEqual({
    page: 2,
    pageSize: 100,
    status: "voided",
    type: "deposit",
    dueDateTo: "2026-03-01",
    keyword: "RC",
  });
  expect(
    validateRentalBillsSearch({ page: 0, pageSize: 101, status: "paid", type: "rent2" }),
  ).toEqual({});
});
it("筛选重置页码，并拦截反向日期", async () => {
  const onChange = vi.fn();
  render(<BillFilters search={{ status: "voided", page: 3 }} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("关键词"), { target: { value: " RC " } });
  await userEvent.click(screen.getByRole("button", { name: "查询" }));
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ keyword: "RC", status: "voided", page: 1 }),
  );
});
