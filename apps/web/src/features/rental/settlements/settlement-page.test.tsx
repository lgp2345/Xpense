import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionKey, RentalSettlementDetail } from "@xpense/shared";
import { expect, it, vi } from "vitest";
import { invalidateRentalFinance, rentalFinanceKeys } from "../../../services/rental-finance-query";
import { chargeTermsFixture, financeApiFixture } from "../bills/bill-test-fixtures";
import { SettlementPage } from "./settlement-page";

it("缺少退租结算查看权限时不读取合同结算或资金", () => {
  const api = financeApiFixture();
  renderPage(api, []);

  expect(screen.getByText("你没有查看退租结算的权限。")).toBeInTheDocument();
  expect(api.getSettlement).not.toHaveBeenCalled();
  expect(api.settlementHistory).not.toHaveBeenCalled();
  expect(api.listCash).not.toHaveBeenCalled();
});

it("结算确认不等同退款；可退金额按全额确认并刷新为已结清", async () => {
  const refundable = settlementFixture({
    balance: {
      receivedMinor: 300_000,
      refundedMinor: 0,
      netReceivedMinor: 300_000,
      outstandingMinor: 0,
      refundableMinor: 280_000,
      state: "refundable",
      overdue: false,
      version: "settlement-cash-v1",
    },
    finalCostMinor: 20_000,
    status: "pending_refund",
  });
  const settled = settlementFixture({
    balance: {
      receivedMinor: 300_000,
      refundedMinor: 280_000,
      netReceivedMinor: 20_000,
      outstandingMinor: 0,
      refundableMinor: 0,
      state: "settled",
      overdue: false,
      version: "settlement-cash-v2",
    },
    finalCostMinor: 20_000,
    status: "settled",
  });
  const api = financeApiFixture({
    getSettlement: vi
      .fn()
      .mockResolvedValueOnce({ settlement: refundable })
      .mockResolvedValue({ settlement: settled }),
    confirmRefund: vi.fn().mockResolvedValue({}),
    listCash: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  });
  renderPage(api, ["rental_settlements:read", "rental_receipts:create", "rental_refunds:create"]);

  expect(await screen.findByText(/结算已确认.*仍待退款/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "确认已退 ¥2,800.00" }));

  expect(api.confirmRefund).not.toHaveBeenCalled();
  expect(await screen.findByRole("alertdialog", { name: "确认全额退款" })).toHaveTextContent(
    "¥2,800.00",
  );
  await userEvent.click(screen.getByRole("button", { name: "返回" }));
  expect(api.confirmRefund).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "确认已退 ¥2,800.00" }));
  await userEvent.click(screen.getByRole("button", { name: "确认登记退款" }));

  expect(api.confirmRefund).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      target: { kind: "settlement", settlementId: "settlement-a" },
      expectedVersion: "settlement-cash-v1",
    }),
  );
  expect(await screen.findByText(/已结清/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /确认已退/ })).not.toBeInTheDocument();
});

it("切换到已有缓存的合同后，旧合同预览不能确认且新预览只提交新合同", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  for (const contractId of ["contract-a", "contract-b"])
    queryClient.setQueryData(rentalFinanceKeys.settlement("org-a", contractId), {
      settlement: null,
    });
  const api = financeApiFixture({
    getSettlement: vi.fn().mockResolvedValue({ settlement: null }),
    previewSettlement: vi.fn().mockResolvedValue({
      version: "preview-v1",
      canConfirm: true,
      missingFields: [],
      effectiveEndDate: "2026-09-30",
      billChanges: [],
      finalCostMinor: 0,
      receivedMinor: 0,
      refundedMinor: 0,
      differenceMinor: 0,
    }),
    confirmSettlement: vi.fn().mockResolvedValue(settlementFixture()),
  });
  const page = (contractId: string) => (
    <QueryClientProvider client={queryClient}>
      <SettlementPage
        organizationId="org-a"
        contractId={contractId}
        permissions={["rental_settlements:read", "rental_settlements:confirm"]}
        api={api}
      />
    </QueryClientProvider>
  );
  const view = render(page("contract-a"));
  await userEvent.click(screen.getByRole("button", { name: "预览结算" }));
  expect(
    await screen.findByRole("heading", { name: "结算预览 · 截至 2026-09-30" }),
  ).toBeInTheDocument();
  view.rerender(page("contract-b"));
  expect(
    screen.queryByRole("heading", { name: "结算预览 · 截至 2026-09-30" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认结算" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "确认结算" }));
  expect(api.confirmSettlement).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "预览结算" }));
  expect(
    await screen.findByRole("heading", { name: "结算预览 · 截至 2026-09-30" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "确认结算" }));
  expect(api.confirmSettlement).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ contractId: "contract-b" }),
  );
});

it("更正费用后刷新服务端余额并重新显示应退金额", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const settled = settlementFixture();
  const corrected = settlementFixture({
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
  let current = settled;
  const api = financeApiFixture({
    getSettlement: vi.fn(async () => ({ settlement: current })),
    listCash: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SettlementPage
        organizationId="org-a"
        contractId="contract-a"
        permissions={["rental_settlements:read", "rental_refunds:create"]}
        api={api}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/已结清/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /确认已退/ })).not.toBeInTheDocument();
  current = corrected;
  await act(async () => {
    await invalidateRentalFinance(queryClient, "org-a", "contract-a");
  });

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "确认已退 ¥2,800.00" })).toBeInTheDocument(),
  );
});

function renderPage(
  api: ReturnType<typeof financeApiFixture>,
  permissions: readonly PermissionKey[],
) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettlementPage
        organizationId="org-a"
        contractId="contract-a"
        permissions={permissions}
        api={api}
      />
    </QueryClientProvider>,
  );
}

function settlementFixture(
  overrides: Partial<RentalSettlementDetail> = {},
): RentalSettlementDetail {
  return {
    id: "settlement-a",
    contractId: "contract-a",
    eventId: "event-a",
    kind: "termination",
    effectiveEndDate: "2026-09-30",
    version: "settlement-v1",
    revision: 1,
    finalCostMinor: 0,
    balance: {
      receivedMinor: 0,
      refundedMinor: 0,
      netReceivedMinor: 0,
      outstandingMinor: 0,
      refundableMinor: 0,
      state: "settled",
      overdue: false,
      version: "settlement-cash-v1",
    },
    status: "settled",
    confirmedAt: "2026-09-30T00:00:00.000Z",
    confirmedByUserId: "user-a",
    ...overrides,
  };
}

it("结算只询问代收项目，未代收项目缺项不会露出输入", async () => {
  const api = financeApiFixture({
    getChargeTerms: vi
      .fn()
      .mockResolvedValue({ ...chargeTermsFixture, electricityCollectionEnabled: false }),
    previewSettlement: vi.fn().mockResolvedValue({
      version: "p",
      canConfirm: false,
      missingFields: ["waterReading", "electricityReading"],
      effectiveEndDate: "2026-09-30",
      billChanges: [],
      finalCostMinor: 0,
      receivedMinor: 0,
      refundedMinor: 0,
      differenceMinor: 0,
    }),
  });
  renderPage(api, ["rental_settlements:read", "rental_settlements:confirm", "rental_charges:read"]);
  await userEvent.click(await screen.findByRole("button", { name: "预览结算" }));
  expect(await screen.findByLabelText("水表终读数")).toBeInTheDocument();
  expect(screen.queryByLabelText("电表终读数")).not.toBeInTheDocument();
});
