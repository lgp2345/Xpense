import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalCashEntry, RentalSettlementDetail } from "@xpense/shared";
import { expect, it, vi } from "vitest";
import type { RentalFinanceSettlementHistoryItem } from "../../../services/rental-finance-api";
import { financeApiFixture } from "../bills/bill-test-fixtures";
import { SettlementCashHistory, SettlementHistory } from "./settlement-history";

it("显示合同结算版本历史并按合同读取", async () => {
  const api = financeApiFixture({
    settlementHistory: vi.fn().mockResolvedValue({
      items: [
        {
          id: "revision-a",
          settlementId: "settlement-a",
          revision: 2,
          settlement: {
            id: "settlement-a",
            organizationId: "org-a",
            contractId: "contract-a",
            eventId: "termination-a",
            kind: "termination",
            effectiveEndDate: "2026-09-30",
            version: "settlement-v2",
            revision: 1,
            finalCostMinor: 125_000,
            status: "settled",
            snapshot: {
              effectiveEndDate: "2026-09-30",
              withdrawnBillIds: [],
              finalBills: [
                {
                  billId: "bill-a",
                  billingMonth: "2026-09",
                  lines: [],
                  amountMinor: 125_000,
                },
              ],
              finalCostMinor: 125_000,
              differenceMinor: 0,
            },
            confirmedAt: "2026-10-01T09:00:00.000Z",
            confirmedByUserId: "user-a",
            updatedAt: "2026-10-01T09:00:00.000Z",
          },
          reason: "修正结束日期",
          createdByUserId: "user-a",
          createdAt: "2026-10-01T10:00:00.000Z",
        } satisfies RentalFinanceSettlementHistoryItem,
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettlementHistory organizationId="org-a" contractId="contract-a" api={api} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("第 2 次结算更正 · 2026-09-30 · 已结清")).toBeInTheDocument();
  expect(screen.getByText("最终费用 1,250.00")).toBeInTheDocument();
  expect(api.settlementHistory).toHaveBeenCalledExactlyOnceWith(
    { contractId: "contract-a", page: 1, pageSize: 20 },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

it("按结算目标读取资金流水，并使用结算余额版本撤销原收款", async () => {
  const receipt: RentalCashEntry = {
    id: "entry-a",
    contractId: "contract-a",
    target: { kind: "settlement", settlementId: "settlement-a" },
    kind: "receipt",
    purpose: "settlement_receipt",
    amountMinor: 50_000,
    occurredOn: "2026-09-30",
    note: null,
    createdAt: "2026-09-30T10:00:00.000Z",
    createdByUserId: "user-a",
    revokedAt: null,
    revokedByUserId: null,
    revokeReason: null,
  };
  const api = financeApiFixture({
    listCash: vi.fn().mockResolvedValue({ items: [receipt], total: 1, page: 1, pageSize: 20 }),
    revokeReceipt: vi.fn().mockResolvedValue({ ...receipt, revokedAt: "2026-10-01T10:00:00.000Z" }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettlementCashHistory
        organizationId="org-a"
        settlement={settlementFixture()}
        api={api}
        permissions={["rental_receipts:revoke"]}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/收款 · 500.00 · 2026-09-30/)).toBeInTheDocument();
  expect(api.listCash).toHaveBeenCalledWith(
    { target: { kind: "settlement", settlementId: "settlement-a" }, page: 1, pageSize: 20 },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  await userEvent.click(screen.getByRole("button", { name: "撤销收款" }));
  await userEvent.type(screen.getByLabelText("撤销收款原因"), "重复登记");
  await userEvent.click(screen.getByRole("button", { name: "确认撤销" }));

  expect(api.revokeReceipt).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      entryId: "entry-a",
      reason: "重复登记",
      expectedVersion: "settlement-cash-v1",
      idempotencyKey: expect.any(String),
    }),
  );
});

it("未知撤销结果重试同一流水保留请求，改选流水重新确认原因和目标", async () => {
  const receipt: RentalCashEntry = {
    id: "entry-a",
    contractId: "contract-a",
    target: { kind: "settlement", settlementId: "settlement-a" },
    kind: "receipt",
    purpose: "settlement_receipt",
    amountMinor: 50_000,
    occurredOn: "2026-09-30",
    note: null,
    createdAt: "2026-09-30T10:00:00.000Z",
    createdByUserId: "user-a",
    revokedAt: null,
    revokedByUserId: null,
    revokeReason: null,
  };
  const second = { ...receipt, id: "entry-b", amountMinor: 20_000 };
  const revokeReceipt = vi
    .fn()
    .mockRejectedValueOnce(new Error("network"))
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValue({ ...second, revokedAt: "2026-10-01T10:00:00.000Z" });
  const api = financeApiFixture({
    listCash: vi
      .fn()
      .mockResolvedValue({ items: [receipt, second], total: 2, page: 1, pageSize: 20 }),
    revokeReceipt,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettlementCashHistory
        organizationId="org-a"
        settlement={settlementFixture()}
        api={api}
        permissions={["rental_receipts:revoke"]}
      />
    </QueryClientProvider>,
  );
  const buttons = await screen.findAllByRole("button", { name: "撤销收款" });
  const [firstButton, secondButton] = buttons;
  if (!firstButton || !secondButton) throw new Error("应展示两笔可撤销收款");
  await userEvent.click(firstButton);
  await userEvent.type(screen.getByLabelText("撤销收款原因"), "撤销第一笔");
  await userEvent.click(screen.getByRole("button", { name: "确认撤销" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("撤销结果暂未确认");
  await userEvent.click(screen.getByRole("button", { name: "确认撤销" }));
  expect(revokeReceipt).toHaveBeenCalledTimes(2);
  expect(revokeReceipt.mock.calls[1]?.[0]).toEqual(revokeReceipt.mock.calls[0]?.[0]);
  await userEvent.click(secondButton);
  expect(screen.getByLabelText("撤销收款原因")).toHaveValue("");
  await userEvent.type(screen.getByLabelText("撤销收款原因"), "撤销第二笔");
  await userEvent.click(screen.getByRole("button", { name: "确认撤销" }));
  expect(revokeReceipt).toHaveBeenCalledTimes(3);
  expect(revokeReceipt.mock.calls[2]?.[0]).toMatchObject({
    entryId: "entry-b",
    reason: "撤销第二笔",
  });
  expect(revokeReceipt.mock.calls[2]?.[0]?.idempotencyKey).not.toBe(
    revokeReceipt.mock.calls[0]?.[0]?.idempotencyKey,
  );
});

function settlementFixture(): RentalSettlementDetail {
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
  };
}
