import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ApiError } from "../../../services/api-client";
import { BillDetailPage } from "./bill-detail-page";
import { billFixture, billsApiFixture, financeApiFixture } from "./bill-test-fixtures";

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
