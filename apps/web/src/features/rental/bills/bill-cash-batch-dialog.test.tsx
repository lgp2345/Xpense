import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalBillDetail, RentalCashEntry, RentalFinancialBalance } from "@xpense/shared";
import { expect, it, vi } from "vitest";
import { BillReceiptDialog } from "./bill-receipt-dialog";
import { billFixture, billsApiFixture, financeApiFixture } from "./bill-test-fixtures";

type CashBill = RentalBillDetail & { financial: RentalFinancialBalance };
const deposit: CashBill = {
  ...billFixture,
  id: "deposit",
  type: "deposit",
  amountMinor: 5000,
  modelVersion: 2,
  financial: {
    receivedMinor: 0,
    refundedMinor: 0,
    netReceivedMinor: 0,
    outstandingMinor: 5000,
    refundableMinor: 0,
    state: "unpaid",
    overdue: false,
    version: "v1",
  },
};
const monthly: CashBill = {
  ...deposit,
  id: "monthly",
  type: "monthly",
  billNumber: "RB-2026-000002",
  amountMinor: 8000,
  financial: { ...deposit.financial, outstandingMinor: 8000 },
};
function entry(id: string): RentalCashEntry {
  return {
    id: `cash-${id}`,
    contractId: "contract",
    target: { kind: "bill", billId: id },
    kind: "receipt",
    purpose: id === "deposit" ? "deposit_receipt" : "bill_receipt",
    amountMinor: id === "deposit" ? 5000 : 8000,
    occurredOn: "2026-10-06",
    note: null,
    createdAt: "2026-10-06T00:00:00.000Z",
    createdByUserId: "user",
    revokedAt: null,
    revokedByUserId: null,
    revokeReason: null,
  };
}
function batchFixture() {
  const api = financeApiFixture({
    confirmDepositReceipt: vi.fn().mockResolvedValue(entry("deposit")),
    recordReceipt: vi.fn().mockResolvedValue(entry("monthly")),
  });
  const billsApi = billsApiFixture({
    getBill: vi.fn().mockImplementation(async (id: string) => ({
      ...(id === "deposit" ? deposit : monthly),
      financial: { ...(id === "deposit" ? deposit : monthly).financial, version: "latest" },
    })),
  });
  return { api, billsApi };
}
function renderBatch(fixture = batchFixture(), bills = [deposit, monthly]) {
  const onUpdated = vi.fn();
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <BillReceiptDialog
        organizationId="org"
        bills={bills}
        api={fixture.api}
        billsApi={fixture.billsApi}
        permissions={["rental_receipts:create", "rental_refunds:create"]}
        open
        onOpenChange={vi.fn()}
        onUpdated={onUpdated}
      />
    </QueryClientProvider>,
  );
  return { ...fixture, ...view, onUpdated };
}
async function review() {
  const date = screen.getByLabelText("收款日期");
  fireEvent.change(date, { target: { value: "2026/10/06" } });
  fireEvent.blur(date);
  await userEvent.click(screen.getByRole("button", { name: "核对并登记" }));
}

it("统一发生日期，逐项核对押金全额及普通账单金额，二次确认前不提交", async () => {
  const { api } = renderBatch();
  expect(screen.getByRole("heading", { name: "批量登记收款" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "核对并登记" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("请选择发生日期");
  const amount = screen.getByRole("textbox", { name: "RB-2026-000002 本次收款金额" });
  expect(amount).toHaveValue("80.00");
  fireEvent.change(amount, { target: { value: "25.00" } });
  await review();
  expect(screen.getByRole("alertdialog")).toHaveTextContent("确认批量收款");
  expect(api.recordReceipt).not.toHaveBeenCalled();
  expect(api.confirmDepositReceipt).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "确认登记收款" }));
  expect(await screen.findByText("已登记 2 笔，失败 0 笔")).toBeInTheDocument();
  expect(api.recordReceipt).toHaveBeenCalledWith(
    expect.objectContaining({
      amountMinor: 2500,
      occurredOn: "2026-10-06",
      expectedVersion: "latest",
    }),
  );
  expect(api.confirmDepositReceipt).toHaveBeenCalledWith(
    expect.objectContaining({
      billId: "deposit",
      occurredOn: "2026-10-06",
      expectedVersion: "latest",
    }),
  );
  expect(vi.mocked(api.confirmDepositReceipt).mock.calls[0]?.[0]).not.toHaveProperty("amountMinor");
});

it("部分失败后可重试失败项，已成功项不会重复登记", async () => {
  const fixture = batchFixture();
  vi.mocked(fixture.api.recordReceipt).mockRejectedValueOnce(new Error("response lost"));
  renderBatch(fixture);
  await review();
  await userEvent.click(screen.getByRole("button", { name: "确认登记收款" }));
  expect(await screen.findByText("已登记 1 笔，失败 1 笔")).toBeInTheDocument();
  expect(screen.getByLabelText("收款日期")).toBeDisabled();
  expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();
  expect(screen.getByText("有操作结果尚未确认，请沿用原请求重试后再关闭。")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "重试失败账单" }));
  await screen.findByText("已登记 2 笔，失败 0 笔");
  expect(fixture.api.confirmDepositReceipt).toHaveBeenCalledOnce();
  expect(fixture.api.recordReceipt).toHaveBeenCalledTimes(2);
  expect(vi.mocked(fixture.api.recordReceipt).mock.calls[0]?.[0]).toEqual(
    vi.mocked(fixture.api.recordReceipt).mock.calls[1]?.[0],
  );
});

it("卸载后丢弃迟到详情，不再开始资金写入", async () => {
  let resolve: (value: RentalBillDetail) => void = () => {};
  const fixture = batchFixture();
  vi.mocked(fixture.billsApi.getBill).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = renderBatch(fixture);
  await review();
  await userEvent.click(screen.getByRole("button", { name: "确认登记收款" }));
  await waitFor(() => expect(fixture.billsApi.getBill).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () => resolve(deposit));
  expect(fixture.api.recordReceipt).not.toHaveBeenCalled();
  expect(fixture.api.confirmDepositReceipt).not.toHaveBeenCalled();
  expect(view.onUpdated).not.toHaveBeenCalled();
});

it("等待详情时撤回权限会暂停后续登记，恢复权限后可继续", async () => {
  let resolve: (value: RentalBillDetail) => void = () => {};
  const fixture = batchFixture();
  vi.mocked(fixture.billsApi.getBill).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const client = new QueryClient();
  const props = {
    organizationId: "org",
    bills: [deposit, monthly],
    api: fixture.api,
    billsApi: fixture.billsApi,
    open: true,
    onOpenChange: vi.fn(),
    onUpdated: vi.fn(),
  };
  const content = (permissions: "rental_receipts:create"[]) => (
    <QueryClientProvider client={client}>
      <BillReceiptDialog {...props} permissions={permissions} />
    </QueryClientProvider>
  );
  const view = render(content(["rental_receipts:create"]));
  await review();
  await userEvent.click(screen.getByRole("button", { name: "确认登记收款" }));
  await waitFor(() => expect(fixture.billsApi.getBill).toHaveBeenCalledOnce());
  view.rerender(content([]));
  await act(async () => resolve(deposit));
  expect(fixture.api.confirmDepositReceipt).not.toHaveBeenCalled();
  expect(fixture.api.recordReceipt).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "继续登记" })).toBeDisabled();
  view.rerender(content(["rental_receipts:create"]));
  await userEvent.click(screen.getByRole("button", { name: "继续登记" }));
  await screen.findByText("已登记 2 笔，失败 0 笔");
  expect(fixture.api.confirmDepositReceipt).toHaveBeenCalledOnce();
  expect(fixture.api.recordReceipt).toHaveBeenCalledOnce();
});
