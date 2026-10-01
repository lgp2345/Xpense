import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalCashEntry } from "@xpense/shared";
import { describe, expect, it } from "vitest";
import { BillCashHistory } from "./bill-cash-history";
import { billFixture, financeApiFixture } from "./bill-test-fixtures";

const bill = {
  ...billFixture,
  type: "monthly" as const,
  modelVersion: 2 as const,
  financial: {
    receivedMinor: 40000,
    refundedMinor: 0,
    netReceivedMinor: 40000,
    outstandingMinor: 50000,
    refundableMinor: 0,
    state: "partial" as const,
    overdue: false,
    version: "cash-v1",
  },
};

const receipt: RentalCashEntry = {
  id: "entry-1",
  contractId: bill.contractId,
  target: { kind: "bill", billId: bill.id },
  kind: "receipt",
  purpose: "bill_receipt",
  amountMinor: 40000,
  occurredOn: "2026-08-15",
  note: "转账",
  createdAt: "2026-08-15T10:00:00.000Z",
  createdByUserId: "user-1",
  revokedAt: null,
  revokedByUserId: null,
  revokeReason: null,
};

describe("账单收退款历史", () => {
  it("按 Enter 提交有撤销原因的表单", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      listCash: async () => ({ items: [receipt], total: 1, page: 1, pageSize: 20 }),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillCashHistory
          organizationId="org"
          bill={bill}
          api={api}
          permissions={["rental_bills:read", "rental_receipts:revoke"]}
        />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "撤销收款" }));
    const reason = screen.getByLabelText("撤销原因");
    await user.type(reason, "重复登记");
    await user.type(reason, "{Enter}");

    await waitFor(() =>
      expect(api.revokeReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          entryId: "entry-1",
          reason: "重复登记",
          expectedVersion: "cash-v1",
        }),
      ),
    );
  });

  it("撤销原因错误定位到必填字段", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      listCash: async () => ({ items: [receipt], total: 1, page: 1, pageSize: 20 }),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillCashHistory
          organizationId="org"
          bill={bill}
          api={api}
          permissions={["rental_bills:read", "rental_receipts:revoke"]}
        />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "撤销收款" }));
    await user.click(screen.getByRole("button", { name: "确认撤销" }));

    expect(
      await screen.findByText("请填写撤销原因。", { selector: "[role=alert]" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("撤销原因")).toHaveAttribute("aria-invalid", "true");
  });

  it("展示服务端流水并要求撤销原因", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      listCash: async () => ({ items: [receipt], total: 1, page: 1, pageSize: 20 }),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillCashHistory
          organizationId="org"
          bill={bill}
          api={api}
          permissions={["rental_bills:read", "rental_receipts:revoke"]}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/收款 · CNY 400.00 · 2026-08-15/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "撤销收款" }));
    await user.click(screen.getByRole("button", { name: "确认撤销" }));
    expect(
      await screen.findByText("请填写撤销原因。", { selector: "[role=alert]" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("撤销原因"), "重复登记");
    await user.click(screen.getByRole("button", { name: "确认撤销" }));
    await waitFor(() =>
      expect(api.revokeReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          entryId: "entry-1",
          reason: "重复登记",
          expectedVersion: "cash-v1",
        }),
      ),
    );
  });

  it("关联结算后仍保留原账单流水目标与账单版本撤销", async () => {
    const user = userEvent.setup();
    const linkedBill = { ...bill, settlementId: "settlement-1" };
    const api = financeApiFixture({
      listCash: vi.fn().mockResolvedValue({ items: [receipt], total: 1, page: 1, pageSize: 20 }),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillCashHistory
          organizationId="org"
          bill={linkedBill}
          api={api}
          permissions={["rental_bills:read", "rental_receipts:revoke"]}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/收款 · CNY 400.00/)).toBeInTheDocument();
    expect(api.listCash).toHaveBeenCalledWith(
      expect.objectContaining({ target: { kind: "bill", billId: bill.id } }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await user.click(screen.getByRole("button", { name: "撤销收款" }));
    await user.type(screen.getByLabelText("撤销原因"), "重复登记");
    await user.click(screen.getByRole("button", { name: "确认撤销" }));
    await waitFor(() =>
      expect(api.revokeReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: "entry-1", expectedVersion: "cash-v1" }),
      ),
    );
  });

  it("账单历史卸载后忽略迟到撤销回调和旧缓存失效", async () => {
    const user = userEvent.setup();
    let resolveRevoke!: () => void;
    const api = financeApiFixture({
      listCash: vi.fn().mockResolvedValue({ items: [receipt], total: 1, page: 1, pageSize: 20 }),
      revokeReceipt: vi.fn(
        () => new Promise<RentalCashEntry>((resolve) => (resolveRevoke = () => resolve(receipt))),
      ),
    });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const view = render(
      <QueryClientProvider client={queryClient}>
        <BillCashHistory
          organizationId="org-a"
          bill={bill}
          api={api}
          permissions={["rental_bills:read", "rental_receipts:revoke"]}
        />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "撤销收款" }));
    await user.type(screen.getByLabelText("撤销原因"), "重复登记");
    await user.click(screen.getByRole("button", { name: "确认撤销" }));
    await waitFor(() => expect(api.revokeReceipt).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      resolveRevoke();
      await Promise.resolve();
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("撤销未知结果重试原键，修改原因后使用新键", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      listCash: vi.fn().mockResolvedValue({ items: [receipt], total: 1, page: 1, pageSize: 20 }),
      revokeReceipt: vi
        .fn<() => Promise<RentalCashEntry>>()
        .mockRejectedValueOnce(new Error("response lost"))
        .mockRejectedValueOnce(new Error("response lost")),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillCashHistory
          organizationId="org"
          bill={bill}
          api={api}
          permissions={["rental_bills:read", "rental_receipts:revoke"]}
        />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "撤销收款" }));
    const reason = screen.getByLabelText("撤销原因");
    await user.type(reason, "重复登记");
    await user.click(screen.getByRole("button", { name: "确认撤销" }));
    expect(await screen.findByText("撤销结果暂未确认，可重试原请求。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认撤销" }));
    await waitFor(() => expect(api.revokeReceipt).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.revokeReceipt).mock.calls[1]?.[0]).toEqual(
      vi.mocked(api.revokeReceipt).mock.calls[0]?.[0],
    );
    const original = vi.mocked(api.revokeReceipt).mock.calls[0]?.[0];
    if (!original) throw new Error("Expected the original revoke attempt");

    await user.type(reason, "，补充");
    await user.click(screen.getByRole("button", { name: "确认撤销" }));
    await waitFor(() => expect(api.revokeReceipt).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api.revokeReceipt).mock.calls[2]?.[0].idempotencyKey).not.toBe(
      original.idempotencyKey,
    );
  });
});
