import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { BillListCashActions } from "./bill-list-cash-actions";
import { billFixture, billsApiFixture, financeApiFixture } from "./bill-test-fixtures";

const bill = {
  ...billFixture,
  modelVersion: 2 as const,
  financial: {
    receivedMinor: 0,
    refundedMinor: 0,
    netReceivedMinor: 0,
    outstandingMinor: 900000,
    refundableMinor: 0,
    state: "unpaid" as const,
    overdue: false,
    version: "v",
  },
};
const refund = {
  ...bill,
  id: "refund",
  billNumber: "RB-2026-000002",
  financial: {
    ...bill.financial,
    outstandingMinor: 0,
    refundableMinor: 5000,
    state: "refundable" as const,
  },
};

it("多选仅登记收款，共用详情弹框且有可退余额的账单不参与选择", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillListCashActions
        organizationId="org"
        items={[bill, refund]}
        api={billsApiFixture()}
        financeApi={financeApiFixture()}
        permissions={["rental_receipts:create", "rental_refunds:create"]}
        onNavigate={vi.fn()}
        onUpdated={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("button", { name: "收款（0）" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: /退款（/ })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: `选择账单 ${refund.billNumber}` })).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox", { name: "选择当前页可登记账单" }));
  expect(screen.getByText("已选 1 张")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "收款（1）" }));
  expect(screen.getByRole("heading", { name: "批量登记收款" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: bill.billNumber })).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: refund.billNumber })).not.toBeInTheDocument();
});

it.each([
  { permissions: ["rental_bills:read"] as const },
  { permissions: ["rental_bills:read", "rental_refunds:create"] as const },
])("只有查看或退款权限不展示列表多选及操作入口，只显示账单事实", ({ permissions }) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillListCashActions
        organizationId="org"
        items={[bill]}
        api={billsApiFixture()}
        financeApi={financeApiFixture()}
        permissions={permissions}
        onNavigate={vi.fn()}
        onUpdated={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /收款（/ })).not.toBeInTheDocument();
  expect(screen.getByText("待收款")).toBeInTheDocument();
});

it("切换组织后清除选择及已打开的统一登记弹框", async () => {
  const client = new QueryClient();
  const props = {
    items: [bill],
    api: billsApiFixture(),
    financeApi: financeApiFixture(),
    permissions: ["rental_receipts:create"] as const,
    onNavigate: vi.fn(),
    onUpdated: vi.fn(),
  };
  const view = render(
    <QueryClientProvider client={client}>
      <BillListCashActions organizationId="a" {...props} />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "选择当前页可登记账单" }));
  await userEvent.click(screen.getByRole("button", { name: "收款（1）" }));
  view.rerender(
    <QueryClientProvider client={client}>
      <BillListCashActions organizationId="b" {...props} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "收款（0）" })).toBeDisabled();
});
