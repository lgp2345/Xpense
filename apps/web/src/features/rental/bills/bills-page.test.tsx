import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { billFixture, billsApiFixture } from "./bill-test-fixtures";
import { BillsPage } from "./bills-page";

it("恢复 URL 筛选和分页，不再展示费用构成汇总", async () => {
  const api = billsApiFixture({
    listBills: vi.fn().mockResolvedValue({
      items: [{ ...billFixture, status: "voided" }],
      total: 101,
      page: 2,
      pageSize: 20,
      totals: { rentAmountMinor: 900000, depositAmountMinor: 300000 },
      coverage: null,
    }),
  });
  const onSearchChange = vi.fn();
  const onNavigate = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillsPage
        organizationId="org"
        api={api}
        permissions={["rental_bills:read"]}
        search={{ status: "voided", page: 2, keyword: "RC" }}
        onSearchChange={onSearchChange}
        onNavigate={onNavigate}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("RB-2026-000001")).toBeInTheDocument();
  expect(screen.getByLabelText("关键词")).toHaveValue("RC");
  expect(screen.queryByRole("region", { name: "费用构成汇总" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "收退款汇总" })).not.toBeInTheDocument();
  expect(screen.queryByText(/有效月度账单/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "下一页" }));
  expect(onSearchChange).toHaveBeenCalledWith(
    expect.objectContaining({ page: 3, status: "voided", keyword: "RC" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "RB-2026-000001" }));
  expect(onNavigate).toHaveBeenCalledWith("bill");
});
it("无查看权限不请求", () => {
  const api = billsApiFixture();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillsPage
        organizationId="org"
        api={api}
        permissions={[]}
        search={{}}
        onSearchChange={vi.fn()}
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(api.listBills).not.toHaveBeenCalled();
});

it("在账单列表中准确标示月度综合账单", async () => {
  const api = billsApiFixture({
    listBills: vi.fn().mockResolvedValue({
      items: [{ ...billFixture, type: "monthly", modelVersion: 2, billingMonth: "2026-09" }],
      total: 1,
      page: 1,
      pageSize: 20,
      totals: { rentAmountMinor: 0, depositAmountMinor: 0, monthlyAmountMinor: 12_300 },
      coverage: null,
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillsPage
        organizationId="org"
        api={api}
        permissions={["rental_bills:read"]}
        search={{ type: "monthly" }}
        onSearchChange={vi.fn()}
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("月度综合账单")).toBeInTheDocument();
});

it("新版账单含实际收款时不再宣称收款情况尚未登记", async () => {
  const api = billsApiFixture({
    listBills: vi.fn().mockResolvedValue({
      items: [
        {
          ...billFixture,
          type: "monthly",
          modelVersion: 2,
          billingMonth: "2026-09",
          financial: {
            receivedMinor: 30000,
            refundedMinor: 0,
            netReceivedMinor: 30000,
            outstandingMinor: 50000,
            refundableMinor: 0,
            state: "partial",
            overdue: false,
            version: "cash-v1",
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totals: {
        rentAmountMinor: 0,
        depositAmountMinor: 0,
        monthlyAmountMinor: 80000,
        financial: {
          receivedMinor: 30000,
          refundedMinor: 0,
          outstandingMinor: 50000,
          refundableMinor: 0,
        },
      },
      coverage: null,
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillsPage
        organizationId="org"
        api={api}
        permissions={["rental_bills:read"]}
        search={{}}
        onSearchChange={vi.fn()}
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("RB-2026-000001")).toBeInTheDocument();
  expect(screen.queryByText("本阶段仅记录应收，收款情况尚未登记")).not.toBeInTheDocument();
  expect(screen.getByText("按条件查询账单，核对收款与退款余额")).toBeInTheDocument();
});

it.each([1, 9])("第 %i 页保留全筛选收退款汇总，空页也不丢失金额", async (page) => {
  const api = billsApiFixture({
    listBills: vi.fn().mockResolvedValue({
      items: page === 1 ? [{ ...billFixture, type: "monthly", modelVersion: 2 }] : [],
      total: 1,
      page,
      pageSize: 20,
      totals: {
        rentAmountMinor: 0,
        depositAmountMinor: 0,
        monthlyAmountMinor: 10_000,
        financial: {
          receivedMinor: 100_000,
          refundedMinor: 90_000,
          outstandingMinor: 4_000,
          refundableMinor: 7_000,
        },
      },
      coverage: null,
    }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillsPage
        organizationId="org"
        api={api}
        permissions={["rental_bills:read"]}
        search={{ type: "monthly", page }}
        onSearchChange={vi.fn()}
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("region", { name: "收退款汇总" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "费用构成汇总" })).not.toBeInTheDocument();
  expect(screen.getByText("累计已收 1,000.00")).toBeInTheDocument();
  expect(screen.getByText("累计已退 900.00")).toBeInTheDocument();
  expect(screen.getByText("待收 40.00")).toBeInTheDocument();
  expect(screen.getByText("待退 70.00")).toBeInTheDocument();
  expect(
    screen.getByText("当前筛选结果汇总。已纳入结算的收退与余额按整个合同统计。"),
  ).toBeInTheDocument();
  if (page === 9) expect(screen.getByText("没有符合条件的账单。")).toBeInTheDocument();
});
