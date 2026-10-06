import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { BillTable } from "./bill-table";
import { billFixture } from "./bill-test-fixtures";

const paid = {
  ...billFixture,
  id: "paid",
  modelVersion: 2 as const,
  type: "deposit" as const,
  amountMinor: 100_000,
  financial: {
    receivedMinor: 100_000,
    refundedMinor: 0,
    netReceivedMinor: 100_000,
    outstandingMinor: 0,
    refundableMinor: 0,
    state: "settled" as const,
    overdue: false,
    version: "v1",
  },
};
const pending = {
  ...paid,
  id: "pending",
  billNumber: "RB-2026-000002",
  amountMinor: 30_000,
  financial: {
    ...paid.financial,
    receivedMinor: 0,
    netReceivedMinor: 0,
    outstandingMinor: 30_000,
    state: "unpaid" as const,
  },
};

it("在账单标识旁体现真实结清状态，并展示每张已收和待收金额", () => {
  render(<BillTable items={[paid, pending]} />);
  const paidRow = screen.getByText(paid.billNumber).closest("tr");
  if (!paidRow) throw new Error("账单行缺失");
  expect(within(paidRow).getByText("已结清")).toBeInTheDocument();
  expect(within(paidRow).getByText("已收 CNY 1,000.00")).toBeInTheDocument();
  expect(within(paidRow).getByText("待收 CNY 0.00")).toBeInTheDocument();
  expect(screen.getByText("待收款")).toBeInTheDocument();
  expect(screen.getByText("待收 CNY 300.00")).toBeInTheDocument();
});

it("按当前页可操作账单多选，已结清账单不能再选中登记", async () => {
  const onSelectionChange = vi.fn();
  render(
    <BillTable
      items={[paid, pending]}
      selection={{
        ids: [],
        selectableIds: ["pending"],
        onChange: onSelectionChange,
      }}
    />,
  );
  expect(screen.getByRole("checkbox", { name: `选择账单 ${paid.billNumber}` })).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox", { name: "选择当前页可登记账单" }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(["pending"]);
  await userEvent.click(screen.getByRole("checkbox", { name: `选择账单 ${pending.billNumber}` }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(["pending"]);
});

it("旧账单不根据到期日推断收款，仍显示独立的账单有效状态", () => {
  render(<BillTable items={[billFixture]} />);
  expect(screen.getByText("收款状态未提供")).toBeInTheDocument();
  expect(screen.getByText("有效")).toBeInTheDocument();
  expect(screen.queryByText("已结清")).not.toBeInTheDocument();
});

it("纳入合同结算的账单展示收退事实，不展示独立待收或可退余额", () => {
  render(
    <BillTable
      items={[
        {
          ...pending,
          settlementId: "settlement-1",
          financial: { ...pending.financial, receivedMinor: 10_000, refundableMinor: 5_000 },
        },
      ]}
    />,
  );
  expect(screen.getByText("已纳入结算")).toBeInTheDocument();
  expect(screen.getByText("已收 CNY 100.00")).toBeInTheDocument();
  expect(screen.getByText("收退由合同结算处理")).toBeInTheDocument();
  expect(screen.queryByText(/待收 CNY/)).not.toBeInTheDocument();
  expect(screen.queryByText(/可退 CNY/)).not.toBeInTheDocument();
});
