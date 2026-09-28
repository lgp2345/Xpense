import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ApiError } from "../../../services/api-client";
import { BillDetailPage } from "./bill-detail-page";
import { billFixture, billsApiFixture } from "./bill-test-fixtures";

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
