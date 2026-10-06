import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalCashEntry } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { BillReceiptDialog } from "./bill-receipt-dialog";
import { billFixture, financeApiFixture } from "./bill-test-fixtures";

function renderDialog(bill = billFixture, api = financeApiFixture()) {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillReceiptDialog
        organizationId="org"
        bill={bill}
        api={api}
        permissions={["rental_receipts:create", "rental_refunds:create"]}
        open
        onOpenChange={onOpenChange}
        onUpdated={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

const monthlyBill = {
  ...billFixture,
  type: "monthly" as const,
  modelVersion: 2 as const,
  financial: {
    receivedMinor: 10000,
    refundedMinor: 0,
    netReceivedMinor: 10000,
    outstandingMinor: 90000,
    refundableMinor: 0,
    state: "partial" as const,
    overdue: false,
    version: "cash-v3",
  },
};

describe("账单收退款", () => {
  it("本次收款按每次输入的金额和当前资金版本提交", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture();
    renderDialog(monthlyBill, api);
    fireEvent.change(screen.getByLabelText("收款日期"), { target: { value: "2026-08-31" } });
    await user.type(screen.getByLabelText("本次收款金额（元）"), "250");
    await user.click(screen.getByRole("button", { name: "登记本次收款" }));

    await waitFor(() =>
      expect(api.recordReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { kind: "bill", billId: "bill" },
          amountMinor: 25000,
          expectedVersion: "cash-v3",
        }),
      ),
    );
  });

  it("缺少收款日期或金额时给出字段错误", async () => {
    const user = userEvent.setup();
    renderDialog(monthlyBill);

    await user.click(screen.getByRole("button", { name: "登记本次收款" }));
    expect(
      await screen.findByText("请选择发生日期。", { selector: "[role=alert]" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("收款日期")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("收款日期"), { target: { value: "2026-08-31" } });
    await user.click(screen.getByRole("button", { name: "登记本次收款" }));
    expect(
      await screen.findByText("请输入不超过待收金额的有效收款金额。", { selector: "[role=alert]" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("本次收款金额（元）")).toHaveAttribute("aria-invalid", "true");
  });

  it("按 Enter 提交有效收款", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture();
    renderDialog(monthlyBill, api);
    fireEvent.change(screen.getByLabelText("收款日期"), { target: { value: "2026-08-31" } });
    const amountInput = screen.getByLabelText("本次收款金额（元）");
    await user.type(amountInput, "250");
    await user.type(amountInput, "{Enter}");

    await waitFor(() =>
      expect(api.recordReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinor: 25000 }),
      ),
    );
  });

  it("退款二次确认说明当前全额可退款金额", async () => {
    const user = userEvent.setup();
    renderDialog({
      ...monthlyBill,
      financial: { ...monthlyBill.financial, refundableMinor: 10000 },
    });
    await user.click(screen.getByRole("button", { name: "确认全额退款" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      /将全额退还当前可退款金额\s*CNY 100\.00，\s*请确认到账日期和备注无误。/,
    );
  });

  it("押金只提供全额确认，退款还需二次确认且不发送金额", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture();
    renderDialog(
      {
        ...monthlyBill,
        type: "deposit",
        financial: { ...monthlyBill.financial, outstandingMinor: 100000, refundableMinor: 10000 },
      },
      api,
    );
    fireEvent.change(screen.getByLabelText("收款日期"), { target: { value: "2026-08-31" } });
    expect(screen.queryByLabelText("本次收款金额（元）")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认押金全额收款" }));
    await waitFor(() =>
      expect(api.confirmDepositReceipt).toHaveBeenCalledWith(
        expect.not.objectContaining({ amountMinor: expect.anything() }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "确认全额退款" }));
    expect(api.confirmRefund).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "二次确认退款" }));
    await waitFor(() =>
      expect(api.confirmRefund).toHaveBeenCalledWith(
        expect.not.objectContaining({ amountMinor: expect.anything() }),
      ),
    );
  });

  it("已纳入结算的账单不接受原账单目标的收退款", () => {
    const api = financeApiFixture();
    renderDialog(
      {
        ...monthlyBill,
        settlementId: "settlement-1",
        financial: { ...monthlyBill.financial, refundableMinor: 10000 },
      },
      api,
    );
    expect(screen.getByText(/已纳入退租结算/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登记本次收款" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认全额退款" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("收款日期")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("本次收款金额（元）")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("备注")).not.toBeInTheDocument();
    expect(api.recordReceipt).not.toHaveBeenCalled();
    expect(api.confirmRefund).not.toHaveBeenCalled();
  });

  it("提交期间关闭控件和 Escape 都不能关闭收退款弹框", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      recordReceipt: vi.fn(() => new Promise<RentalCashEntry>(() => {})),
    });
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillReceiptDialog
          organizationId="org"
          bill={monthlyBill}
          api={api}
          permissions={["rental_receipts:create"]}
          open
          onOpenChange={onOpenChange}
          onUpdated={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("收款日期"), { target: { value: "2026-08-31" } });
    await user.type(screen.getByLabelText("本次收款金额（元）"), "250");
    await user.click(screen.getByRole("button", { name: "登记本次收款" }));
    await waitFor(() => expect(api.recordReceipt).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("heading", { name: "登记账单收退款" })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("账单详情卸载后忽略迟到的收款成功及旧页面刷新", async () => {
    const user = userEvent.setup();
    let resolveReceipt!: (entry: RentalCashEntry) => void;
    const api = financeApiFixture({
      recordReceipt: vi.fn(
        () => new Promise<RentalCashEntry>((resolve) => (resolveReceipt = resolve)),
      ),
    });
    const onUpdated = vi.fn();
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const view = render(
      <QueryClientProvider client={queryClient}>
        <BillReceiptDialog
          organizationId="org-a"
          bill={monthlyBill}
          api={api}
          permissions={["rental_receipts:create"]}
          open
          onOpenChange={onOpenChange}
          onUpdated={onUpdated}
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("收款日期"), { target: { value: "2026-08-31" } });
    await user.type(screen.getByLabelText("本次收款金额（元）"), "250");
    await user.click(screen.getByRole("button", { name: "登记本次收款" }));
    await waitFor(() => expect(api.recordReceipt).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      resolveReceipt({} as RentalCashEntry);
      await Promise.resolve();
    });

    expect(onUpdated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("收款未知结果重试原金额与原键，金额变化后使用新键", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      recordReceipt: vi.fn().mockRejectedValueOnce(new Error("response lost")),
    });
    renderDialog(monthlyBill, api);
    fireEvent.change(screen.getByLabelText("收款日期"), { target: { value: "2026-08-31" } });
    const amount = screen.getByLabelText("本次收款金额（元）");
    await user.type(amount, "250");
    await user.click(screen.getByRole("button", { name: "登记本次收款" }));
    expect(await screen.findByText("操作结果暂未确认，可重试原请求。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "登记本次收款" }));
    await waitFor(() => expect(api.recordReceipt).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.recordReceipt).mock.calls[1]?.[0]).toEqual(
      vi.mocked(api.recordReceipt).mock.calls[0]?.[0],
    );
    const original = vi.mocked(api.recordReceipt).mock.calls[0]?.[0];
    if (!original) throw new Error("Expected the original receipt attempt");

    await user.clear(amount);
    await user.type(amount, "300");
    await user.click(screen.getByRole("button", { name: "登记本次收款" }));
    await waitFor(() => expect(api.recordReceipt).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api.recordReceipt).mock.calls[2]?.[0].idempotencyKey).not.toBe(
      original.idempotencyKey,
    );
  });
});
