import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalCashEntry } from "@xpense/shared";
import { expect, it, vi } from "vitest";
import { ApiError } from "../../../services/api-client";
import { BillDetailPage } from "./bill-detail-page";
import { billFixture, billsApiFixture, financeApiFixture } from "./bill-test-fixtures";

it.each([
  { outstandingMinor: 0, refundableMinor: 0, permission: "rental_receipts:create", visible: false },
  { outstandingMinor: 0, refundableMinor: 0, permission: "rental_refunds:create", visible: false },
  {
    outstandingMinor: 50_000,
    refundableMinor: 0,
    permission: "rental_receipts:create",
    visible: true,
  },
  {
    outstandingMinor: 50_000,
    refundableMinor: 0,
    permission: "rental_refunds:create",
    visible: false,
  },
  {
    outstandingMinor: 0,
    refundableMinor: 5_000,
    permission: "rental_refunds:create",
    visible: true,
  },
  {
    outstandingMinor: 0,
    refundableMinor: 5_000,
    permission: "rental_receipts:create",
    visible: false,
  },
] as const)("待收 $outstandingMinor、可退 $refundableMinor、权限 $permission 时按可操作金额显示登记入口", async ({
  outstandingMinor,
  refundableMinor,
  permission,
  visible,
}) => {
  const receivedMinor = 100_000 - outstandingMinor + refundableMinor;
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      amountMinor: 100_000,
      modelVersion: 2,
      financial: {
        receivedMinor,
        refundedMinor: 0,
        netReceivedMinor: receivedMinor,
        outstandingMinor,
        refundableMinor,
        state: outstandingMinor > 0 ? "partial" : refundableMinor > 0 ? "refundable" : "settled",
        overdue: false,
        version: "cash-v1",
      },
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        financeApi={financeApiFixture()}
        permissions={["rental_bills:read", permission]}
      />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: billFixture.billNumber });
  if (visible) expect(screen.getByRole("button", { name: "登记收退款" })).toBeInTheDocument();
  else expect(screen.queryByRole("button", { name: "登记收退款" })).not.toBeInTheDocument();
});

it("押金全额登记成功后刷新余额并立即隐藏登记入口", async () => {
  let registered = false;
  const api = billsApiFixture({
    getBill: vi.fn().mockImplementation(async () => ({
      ...billFixture,
      type: "deposit",
      modelVersion: 2,
      amountMinor: 100_000,
      financial: {
        receivedMinor: registered ? 100_000 : 0,
        refundedMinor: 0,
        netReceivedMinor: registered ? 100_000 : 0,
        outstandingMinor: registered ? 0 : 100_000,
        refundableMinor: 0,
        state: registered ? "settled" : "unpaid",
        overdue: false,
        version: registered ? "cash-v2" : "cash-v1",
      },
    })),
  });
  const receipt: RentalCashEntry = {
    id: "receipt",
    contractId: "contract",
    target: { kind: "bill", billId: "bill" },
    kind: "receipt",
    purpose: "deposit_receipt",
    amountMinor: 100_000,
    occurredOn: "2026-10-06",
    note: null,
    createdAt: "2026-10-06T00:00:00.000Z",
    createdByUserId: "user",
    revokedAt: null,
    revokedByUserId: null,
    revokeReason: null,
  };
  const financeApi = financeApiFixture({
    confirmDepositReceipt: vi.fn().mockImplementation(async () => {
      registered = true;
      return receipt;
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        financeApi={financeApi}
        permissions={["rental_bills:read", "rental_receipts:create", "rental_refunds:create"]}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "登记收退款" }));
  const date = screen.getByLabelText("收款日期");
  fireEvent.change(date, { target: { value: "2026/10/06" } });
  fireEvent.blur(date);
  await userEvent.click(screen.getByRole("button", { name: "确认押金全额收款" }));
  await screen.findByText("已收 CNY 1,000.00");
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "登记收退款" })).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it.each([0, 5_000])("依据有效收款 %i 展示费用入口并保留单独读数更正", async (receivedMinor) => {
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      modelVersion: 2,
      type: "monthly",
      lines: [
        {
          kind: "water",
          label: "水费",
          amountMinor: 0,
          periodStart: "2026-08-31",
          periodEnd: "2026-09-30",
          referenceStart: null,
          referenceEnd: null,
          coveredDays: null,
          referenceDays: null,
          baseRentAmountMinor: null,
          sortOrder: 0,
          feeSnapshot: {
            kind: "water",
            startReadingId: "start",
            endReadingId: "end",
            startDate: "2026-08-31",
            endDate: "2026-09-30",
            startReading: "0",
            endReading: "0",
            unitPrice: "1",
            overrideReason: null,
          },
        },
      ],
      financial: {
        receivedMinor,
        refundedMinor: receivedMinor,
        netReceivedMinor: 0,
        outstandingMinor: 5_000,
        refundableMinor: 0,
        state: "unpaid",
        overdue: false,
        version: "v",
      },
    }),
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        financeApi={financeApiFixture()}
        permissions={["rental_bills:read", "rental_monthly_bills:adjust"]}
      />
    </QueryClientProvider>,
  );
  const entry = await screen.findByRole("button", {
    name: receivedMinor === 0 ? "编辑本期费用" : "更正账单",
  });
  expect(screen.getByRole("button", { name: "更正真实读数" })).toBeInTheDocument();
  await user.click(entry);
  expect(
    screen.getByRole("heading", { name: receivedMinor === 0 ? "编辑本期费用" : "更正账单" }),
  ).toBeInTheDocument();
});

it("无保存计量快照时不显示真实读数更正入口，费用入口仍可用", async () => {
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      modelVersion: 2,
      type: "monthly",
      financial: {
        receivedMinor: 0,
        refundedMinor: 0,
        netReceivedMinor: 0,
        outstandingMinor: 5_000,
        refundableMinor: 0,
        state: "unpaid",
        overdue: false,
        version: "v",
      },
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        financeApi={financeApiFixture()}
        permissions={["rental_bills:read", "rental_monthly_bills:adjust"]}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("button", { name: "编辑本期费用" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "更正真实读数" })).not.toBeInTheDocument();
});

it("展示生成快照、原计划和差额，不推断收款", async () => {
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      amountMinor: 500000,
      lines: [
        {
          kind: "rent_period",
          label: "原计划租金",
          amountMinor: 900000,
          periodStart: "2026-01-01",
          periodEnd: "2026-03-31",
          referenceStart: "2026-01-01",
          referenceEnd: "2026-01-31",
          coveredDays: 31,
          referenceDays: 31,
          baseRentAmountMinor: 300000,
          sortOrder: 0,
        },
        {
          kind: "termination_adjustment",
          label: "终止差额",
          amountMinor: -400000,
          periodStart: null,
          periodEnd: null,
          referenceStart: null,
          referenceEnd: null,
          coveredDays: null,
          referenceDays: null,
          baseRentAmountMinor: null,
          sortOrder: 1,
        },
      ],
      voidReason: "合同修正",
      history: [
        { ...billFixture, id: "older", status: "voided", propertyName: "历史房产", dueState: null },
      ],
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        permissions={["rental_bills:read"]}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("生成时房产")).toBeInTheDocument();
  expect(screen.getByText("CNY -4,000.00")).toBeInTheDocument();
  expect(screen.getByText(/· 到期日已过/)).toBeInTheDocument();
  expect(screen.getByText(/本阶段仅记录应收/)).toBeInTheDocument();
  expect(screen.getByText(/合同修正/)).toBeInTheDocument();
  expect(screen.getByText("生成批次：batch")).toBeInTheDocument();
  expect(screen.getByText("原付款账期：2026-01-01 至 2026-03-31")).toBeInTheDocument();
  expect(screen.getByText("实际计租范围：2026-01-01 至 2026-03-31")).toBeInTheDocument();
  expect(screen.queryByText(/欠款|未付款|已收款/)).not.toBeInTheDocument();
});
it("月度综合账单按账单费用覆盖期间展示水费区间，不把合同结束日说成计租终点", async () => {
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      type: "monthly",
      modelVersion: 2,
      billingMonth: "2026-09",
      periodStart: "2026-08-31",
      periodEnd: "2026-09-30",
      effectiveEnd: "2026-12-31",
      amountMinor: 9250,
      lines: [
        {
          kind: "water",
          label: "水费",
          amountMinor: 9250,
          periodStart: "2026-08-31",
          periodEnd: "2026-09-30",
          referenceStart: null,
          referenceEnd: null,
          coveredDays: null,
          referenceDays: null,
          baseRentAmountMinor: null,
          sortOrder: 0,
          feeSnapshot: {
            kind: "water",
            startReadingId: "reading-start",
            endReadingId: "reading-end",
            startDate: "2026-08-31",
            endDate: "2026-09-30",
            startReading: "100",
            endReading: "110",
            unitPrice: "9.2500",
            overrideReason: null,
          },
        },
      ],
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        permissions={["rental_bills:read"]}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("月度综合账单 · 有效")).toBeInTheDocument();
  expect(screen.getByText("账单费用覆盖期间：2026-08-31 至 2026-09-30")).toBeInTheDocument();
  expect(screen.queryByText(/原付款账期/)).not.toBeInTheDocument();
  expect(screen.queryByText(/实际计租范围/)).not.toBeInTheDocument();
});

it("押金账单不显示租金计期文案", async () => {
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      type: "deposit",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-01",
      effectiveEnd: "2026-12-31",
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        permissions={["rental_bills:read"]}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("押金 · 有效")).toBeInTheDocument();
  expect(screen.queryByText(/原付款账期|实际计租范围|账单费用覆盖期间/)).not.toBeInTheDocument();
});

it("v2综合账单显示服务端实际收款余额，不套用legacy未知收款文案", async () => {
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      type: "monthly",
      modelVersion: 2,
      billingMonth: "2026-01",
      lines: [
        {
          kind: "extra_fee",
          label: "水电冲减",
          amountMinor: -10000,
          periodStart: null,
          periodEnd: null,
          referenceStart: null,
          referenceEnd: null,
          coveredDays: null,
          referenceDays: null,
          baseRentAmountMinor: null,
          sortOrder: 1,
          note: "上月多收冲减",
          feeSnapshot: {
            kind: "extra_fee",
            extraFeeId: "00000000-0000-4000-8000-000000000001",
            origin: "monthly",
          },
        },
        {
          kind: "water",
          label: "水费",
          amountMinor: 25000,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31",
          referenceStart: null,
          referenceEnd: null,
          coveredDays: null,
          referenceDays: null,
          baseRentAmountMinor: null,
          sortOrder: 2,
          feeSnapshot: {
            kind: "water",
            startReadingId: "reading-start",
            endReadingId: "reading-end",
            startDate: "2026-01-01",
            endDate: "2026-01-31",
            startReading: "100",
            endReading: "110",
            unitPrice: "3.0000",
            overrideReason: "本月协商费率",
          },
        },
      ],
      financial: {
        receivedMinor: 40000,
        refundedMinor: 0,
        netReceivedMinor: 40000,
        outstandingMinor: 50000,
        refundableMinor: 0,
        state: "partial",
        overdue: false,
        version: "cash-v2",
      },
    }),
  });
  const financeApi = financeApiFixture();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        financeApi={financeApi}
        permissions={["rental_bills:read", "rental_receipts:create"]}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("已收 CNY 400.00")).toBeInTheDocument();
  expect(screen.getByText("待收 CNY 500.00")).toBeInTheDocument();
  expect(screen.queryByText("当前补收、退款以合同结算为准。")).not.toBeInTheDocument();
  expect(screen.queryByText(/收款情况尚未登记/)).not.toBeInTheDocument();
  expect(screen.getByText("备注：上月多收冲减")).toBeInTheDocument();
  expect(screen.getByText("水表 100 → 110")).toBeInTheDocument();
  expect(screen.getByText("本期改价原因：本月协商费率")).toBeInTheDocument();
  expect(await screen.findByText("收退款记录")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "登记收退款" })).toBeInTheDocument();
});

it("v2综合账单详情标示月度综合账单而非押金", async () => {
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({ ...billFixture, type: "monthly", modelVersion: 2 }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        permissions={["rental_bills:read"]}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("月度综合账单 · 有效")).toBeInTheDocument();
  expect(screen.queryByText("押金 · 有效")).not.toBeInTheDocument();
});
it("关联结算的有效账单保留原目标资金历史但不显示独立待收", async () => {
  const billReceipt: RentalCashEntry = {
    id: "bill-receipt",
    contractId: "contract",
    target: { kind: "bill", billId: "bill" },
    kind: "receipt",
    purpose: "bill_receipt",
    amountMinor: 30000,
    occurredOn: "2026-09-30",
    note: "原账单收款",
    createdAt: "2026-09-30T10:00:00.000Z",
    createdByUserId: "user",
    revokedAt: null,
    revokedByUserId: null,
    revokeReason: null,
  };
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      type: "monthly",
      modelVersion: 2,
      amountMinor: 80000,
      settlementId: "settlement-a",
      financial: {
        receivedMinor: 30000,
        refundedMinor: 0,
        netReceivedMinor: 30000,
        outstandingMinor: 50000,
        refundableMinor: 0,
        state: "partial",
        overdue: false,
        version: "bill-cash-v1",
      },
    }),
  });
  const financeApi = financeApiFixture({
    listCash: vi.fn().mockResolvedValue({
      items: [billReceipt],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        financeApi={financeApi}
        permissions={["rental_bills:read"]}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("当前补收、退款以合同结算为准。")).toBeInTheDocument();
  expect(screen.getByText("本账单已收 CNY 300.00")).toBeInTheDocument();
  expect(screen.getByText("本账单已退 CNY 0.00")).toBeInTheDocument();
  expect(await screen.findByText(/收款 · CNY 300\.00 · 2026-09-30/)).toBeInTheDocument();
  expect(screen.getByText("已纳入退租结算（settlement-a）")).toBeInTheDocument();
  expect(screen.queryByText("待收 CNY 500.00")).not.toBeInTheDocument();
  expect(screen.queryByText("待收 CNY 0.00")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "查看退租结算" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "登记收退款" })).not.toBeInTheDocument();
  expect(financeApi.listCash).toHaveBeenCalledWith(
    { target: { kind: "bill", billId: "bill" }, page: 1, pageSize: 20 },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(financeApi.getSettlement).not.toHaveBeenCalled();
});

it("关联结算的作废账单保留本账单已收已退并隐藏独立可退差额", async () => {
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      type: "monthly",
      modelVersion: 2,
      status: "voided",
      amountMinor: 0,
      settlementId: "settlement-a",
      financial: {
        receivedMinor: 30000,
        refundedMinor: 0,
        netReceivedMinor: 30000,
        outstandingMinor: 0,
        refundableMinor: 30000,
        state: "refundable",
        overdue: false,
        version: "bill-cash-v2",
      },
    }),
  });
  const navigate = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        permissions={["rental_bills:read", "rental_settlements:read"]}
        navigate={navigate as never}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("当前补收、退款以合同结算为准。")).toBeInTheDocument();
  expect(screen.getByText("本账单已收 CNY 300.00")).toBeInTheDocument();
  expect(screen.getByText("本账单已退 CNY 0.00")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "查看退租结算" })).toBeInTheDocument();
  expect(screen.queryByText("可退 CNY 300.00")).not.toBeInTheDocument();
  expect(screen.queryByText("可退 CNY 0.00")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "登记收退款" })).not.toBeInTheDocument();
});

it("未知 ID 显示错误，不请求当前合同替换快照", async () => {
  const api = billsApiFixture({
    getBill: vi.fn().mockRejectedValue(new ApiError(404, "NOT_FOUND", "missing")),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BillDetailPage
        organizationId="org"
        billId="missing"
        api={api}
        permissions={["rental_bills:read"]}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("账单不存在或无权访问。")).toBeInTheDocument();
});

it("已纳入结算的账单通过有权入口跳转到该合同的真实结算", async () => {
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      modelVersion: 2,
      settlementId: "settlement-1",
      financial: {
        receivedMinor: 900_000,
        refundedMinor: 0,
        netReceivedMinor: 900_000,
        outstandingMinor: 0,
        refundableMinor: 0,
        state: "settled",
        overdue: false,
        version: "cash-v1",
      },
    }),
  });
  const navigate = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        permissions={["rental_bills:read", "rental_settlements:read"]}
        navigate={navigate as never}
      />
    </QueryClientProvider>,
  );

  await userEvent.click(await screen.findByRole("button", { name: "查看退租结算" }));

  expect(navigate).toHaveBeenCalledExactlyOnceWith({
    to: "/rentals/settlements/$contractId",
    params: { contractId: "contract" },
  });
});

it("没有结算查看权限时保留原账单详情且不暴露结算入口", async () => {
  const api = billsApiFixture({
    getBill: vi.fn().mockResolvedValue({
      ...billFixture,
      modelVersion: 2,
      settlementId: "settlement-1",
      financial: {
        receivedMinor: 900_000,
        refundedMinor: 0,
        netReceivedMinor: 900_000,
        outstandingMinor: 0,
        refundableMinor: 0,
        state: "settled",
        overdue: false,
        version: "cash-v1",
      },
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillDetailPage
        organizationId="org"
        billId="bill"
        api={api}
        permissions={["rental_bills:read"]}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("RB-2026-000001")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "查看退租结算" })).not.toBeInTheDocument();
});
