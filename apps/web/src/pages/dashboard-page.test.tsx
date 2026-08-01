import { render, screen, within } from "@testing-library/react";

import { DashboardPage } from "./dashboard-page";

describe("DashboardPage", () => {
  it("renders the approved static finance overview", () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { level: 1, name: "财务洞察" })).toBeInTheDocument();
    expect(screen.getByText("40,439.00")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "收支趋势" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "预算使用" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "最近交易" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "账户概览" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "智能提醒" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "即将到期账单" })).toBeInTheDocument();
  });

  it("renders the user context entry and transaction data", () => {
    render(<DashboardPage />);

    const sidebar = screen.getByRole("complementary", { name: "主要导航" });
    expect(within(sidebar).getByLabelText("当前用户与组织")).toHaveTextContent("未登录");
    expect(within(sidebar).queryByText("刘先生")).not.toBeInTheDocument();
    expect(screen.getByText("盒马鲜生")).toBeInTheDocument();
    expect(screen.getByText("-¥268.50")).toBeInTheDocument();
    expect(screen.getByText("信用卡还款")).toBeInTheDocument();
    expect(screen.getByText("¥3,286.40")).toBeInTheDocument();
  });
});
