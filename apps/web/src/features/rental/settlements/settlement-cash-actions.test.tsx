import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalSettlementDetail } from "@xpense/shared";
import { expect, it, vi } from "vitest";
import { financeApiFixture } from "../bills/bill-test-fixtures";
import { SettlementCashActions } from "./settlement-cash-actions";

it("按当前结算目标分次登记补款并读取该结算流水", async () => {
  const api = financeApiFixture({
    recordReceipt: vi.fn().mockResolvedValue({ id: "cash-a" }),
    listCash: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettlementCashActions
        organizationId="org-a"
        settlement={settlementFixture()}
        api={api}
        permissions={["rental_receipts:create"]}
      />
    </QueryClientProvider>,
  );
  await userEvent.type(await screen.findByLabelText("本次补款金额（元）"), "250.00");
  await userEvent.click(screen.getByRole("button", { name: "登记补款" }));

  expect(api.recordReceipt).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      target: { kind: "settlement", settlementId: "settlement-a" },
      amountMinor: 25_000,
      expectedVersion: "settlement-cash-v1",
      occurredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      idempotencyKey: expect.any(String),
    }),
  );
  expect(api.listCash).toHaveBeenCalledWith(
    { target: { kind: "settlement", settlementId: "settlement-a" }, page: 1, pageSize: 20 },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

it("待退款只提供服务端全额确认，不接收客户输入的退款金额", async () => {
  const settlement = settlementFixture({
    balance: {
      receivedMinor: 300_000,
      refundedMinor: 0,
      netReceivedMinor: 300_000,
      outstandingMinor: 0,
      refundableMinor: 280_000,
      state: "refundable",
      overdue: false,
      version: "settlement-cash-v2",
    },
    finalCostMinor: 20_000,
    status: "pending_refund",
  });
  const api = financeApiFixture({ confirmRefund: vi.fn().mockResolvedValue({}) });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettlementCashActions
        organizationId="org-a"
        settlement={settlement}
        api={api}
        permissions={["rental_refunds:create"]}
      />
    </QueryClientProvider>,
  );

  expect(screen.getByRole("button", { name: "确认已退 ¥2,800.00" })).toBeEnabled();
  expect(screen.queryByLabelText(/退款金额/)).not.toBeInTheDocument();
});

it("退款二次确认后未知失败重试保留原请求，改备注后生成新请求", async () => {
  const original = settlementFixture();
  const settlement = settlementFixture({
    balance: {
      ...original.balance,
      outstandingMinor: 0,
      refundableMinor: 280_000,
      state: "refundable",
    },
    status: "pending_refund",
  });
  const confirmRefund = vi.fn().mockRejectedValue(new Error("network"));
  const api = financeApiFixture({ confirmRefund });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettlementCashActions
        organizationId="org-a"
        settlement={settlement}
        api={api}
        permissions={["rental_refunds:create"]}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "确认已退 ¥2,800.00" }));
  expect(confirmRefund).not.toHaveBeenCalled();
  screen.getByRole("button", { name: "确认登记退款" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("操作结果暂未确认");
  await userEvent.click(screen.getByRole("button", { name: "确认已退 ¥2,800.00" }));
  await userEvent.click(screen.getByRole("button", { name: "确认登记退款" }));
  expect(confirmRefund).toHaveBeenCalledTimes(2);
  expect(confirmRefund.mock.calls[1]?.[0]).toEqual(confirmRefund.mock.calls[0]?.[0]);
  expect(confirmRefund.mock.calls[0]?.[0]).not.toHaveProperty("amountMinor");
  await userEvent.type(screen.getByLabelText("退款备注"), "银行转账");
  await userEvent.click(screen.getByRole("button", { name: "确认已退 ¥2,800.00" }));
  await userEvent.click(screen.getByRole("button", { name: "确认登记退款" }));
  expect(confirmRefund).toHaveBeenCalledTimes(3);
  expect(confirmRefund.mock.calls[2]?.[0]).toMatchObject({ note: "银行转账" });
  expect(confirmRefund.mock.calls[2]?.[0]?.idempotencyKey).not.toBe(
    confirmRefund.mock.calls[0]?.[0]?.idempotencyKey,
  );
});

function settlementFixture(
  overrides: Partial<RentalSettlementDetail> = {},
): RentalSettlementDetail {
  return {
    id: "settlement-a",
    contractId: "contract-a",
    eventId: "termination-a",
    kind: "termination",
    effectiveEndDate: "2026-09-30",
    version: "settlement-v1",
    revision: 1,
    finalCostMinor: 100_000,
    balance: {
      receivedMinor: 50_000,
      refundedMinor: 0,
      netReceivedMinor: 50_000,
      outstandingMinor: 50_000,
      refundableMinor: 0,
      state: "partial",
      overdue: false,
      version: "settlement-cash-v1",
    },
    status: "pending_collection",
    confirmedAt: "2026-09-30T00:00:00.000Z",
    confirmedByUserId: "user-a",
    ...overrides,
  };
}
