import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { billFixture, billsApiFixture } from "./bill-test-fixtures";
import { BillsPage } from "./bills-page";

it("恢复 URL 筛选和分页，作废查询仅展示服务端有效分类汇总", async () => {
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
  expect(screen.getByText(/有效租金 9,000.00/)).toBeInTheDocument();
  expect(screen.getByText(/有效押金 3,000.00/)).toBeInTheDocument();
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
