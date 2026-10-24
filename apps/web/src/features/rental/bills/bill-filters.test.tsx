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
  expect(validateRentalBillsSearch({ type: "period" })).toEqual({ type: "period" });
});
it("支持按账期账单过滤", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<BillFilters search={{}} onChange={onChange} />);
  const category = screen.getByRole("combobox", { name: "费用分类" });
  await user.click(category);
  await user.click(await screen.findByRole("option", { name: "账期账单" }));
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: "period", page: 1 }));
});

it("从查询参数恢复费用分类与状态，并在重置后清空筛选", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <BillFilters
      search={{ type: "deposit", status: "voided", page: 3, pageSize: 50 }}
      onChange={onChange}
    />,
  );

  screen.getByRole("combobox", { name: "费用分类" });
  screen.getByRole("combobox", { name: "账单状态" });
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(onChange).toHaveBeenLastCalledWith({
    type: "deposit",
    status: "voided",
    page: 1,
    pageSize: 50,
  });

  await user.click(screen.getByRole("combobox", { name: "账单状态" }));
  await user.click(await screen.findByRole("option", { name: "有效" }));
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(onChange).toHaveBeenLastCalledWith({
    type: "deposit",
    status: "active",
    page: 1,
    pageSize: 50,
  });

  await user.click(screen.getByRole("button", { name: "重置" }));
  expect(onChange).toHaveBeenLastCalledWith({ status: "active", page: 1, pageSize: 50 });
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

it("通过到期日范围选择器选择结束日期并提交原有查询字段", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <BillFilters
      search={{ dueDateFrom: "2026-10-05", page: 3, pageSize: 50 }}
      onChange={onChange}
    />,
  );
  const trigger = screen.getByRole("button", { name: "到期日范围" });
  await user.click(trigger);
  await screen.findByRole("grid");
  const endDay = screen
    .getAllByRole("button")
    .find((button) => button.dataset.day === new Date(2026, 9, 15).toLocaleDateString());
  expect(endDay).toBeDefined();
  await user.click(endDay as HTMLButtonElement);
  expect(trigger).toHaveTextContent("2026-10-05 - 2026-10-15");
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(onChange).toHaveBeenLastCalledWith({
    status: "active",
    dueDateFrom: "2026-10-05",
    dueDateTo: "2026-10-15",
    page: 1,
    pageSize: 50,
  });
});

it("从 URL 恢复单边范围并在重置后清空日期", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const { rerender } = render(
    <BillFilters search={{ dueDateTo: "2026-10-31", pageSize: 50 }} onChange={onChange} />,
  );
  expect(screen.getByRole("button", { name: "到期日范围" })).toHaveTextContent("- 2026-10-31");
  await user.click(screen.getByRole("button", { name: "查询" }));
  expect(onChange).toHaveBeenLastCalledWith({
    status: "active",
    dueDateTo: "2026-10-31",
    page: 1,
    pageSize: 50,
  });
  await user.click(screen.getByRole("button", { name: "重置" }));
  expect(onChange).toHaveBeenLastCalledWith({ status: "active", page: 1, pageSize: 50 });
  rerender(
    <BillFilters search={{ status: "active", page: 1, pageSize: 50 }} onChange={onChange} />,
  );
  expect(screen.getByRole("button", { name: "到期日范围" })).toHaveTextContent("选择到期日范围");
});

it("阻止 URL 回填的反向日期范围提交", async () => {
  const onChange = vi.fn();
  render(
    <BillFilters
      search={{ dueDateFrom: "2026-10-31", dueDateTo: "2026-10-01" }}
      onChange={onChange}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "查询" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("开始日期不得晚于结束日期");
});
