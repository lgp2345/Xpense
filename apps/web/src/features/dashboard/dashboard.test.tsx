import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { MonthlyStatistics } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";

import type { BookkeepingApi } from "../../services/bookkeeping-api";
import { Dashboard } from "./dashboard";

const statistics: MonthlyStatistics = {
  currency: "CNY",
  incomeMinor: 456_789,
  expenseMinor: 123_456,
  netMinor: 333_333,
  expenseCategories: [
    { categoryId: "food", categoryName: "餐饮", amountMinor: 80_000, percentage: 64.8 },
    { categoryId: "rent", categoryName: "住房", amountMinor: 43_456, percentage: 35.2 },
  ],
};

/** 创建只实现月度统计边界的 Dashboard 测试 API。 */
function createApi(getMonthlyStatistics: BookkeepingApi["getMonthlyStatistics"]): BookkeepingApi {
  return { getMonthlyStatistics } as BookkeepingApi;
}

/** 使用关闭重试的独立缓存渲染 Dashboard。 */
function renderDashboard(api: BookkeepingApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard api={api} organizationId="org-a" />
    </QueryClientProvider>,
  );
}

describe("Dashboard", () => {
  it("loads the current month and renders real income, expense, net, and expense shares", async () => {
    let resolve: (value: MonthlyStatistics) => void = () => undefined;
    const getMonthlyStatistics = vi.fn(
      () =>
        new Promise<MonthlyStatistics>((promiseResolve) => {
          resolve = promiseResolve;
        }),
    );
    renderDashboard(createApi(getMonthlyStatistics));

    expect(screen.getByText("正在加载本月总览...")).toBeInTheDocument();
    const now = new Date();
    expect(getMonthlyStatistics).toHaveBeenCalledWith({
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    });
    resolve(statistics);

    expect(await screen.findByText("¥4,567.89")).toBeInTheDocument();
    expect(screen.getByText("¥1,234.56")).toBeInTheDocument();
    expect(screen.getByText("¥3,333.33")).toBeInTheDocument();
    expect(screen.getByText("餐饮")).toBeInTheDocument();
    expect(screen.getByText("64.8%")).toBeInTheDocument();
    expect(screen.queryByText(/预算|预测/)).not.toBeInTheDocument();
  });

  it("shows a clear monthly statistics error state", async () => {
    renderDashboard(createApi(vi.fn().mockRejectedValue(new Error("offline"))));

    expect(await screen.findByRole("alert")).toHaveTextContent("加载本月总览失败，请稍后重试。");
  });
});
