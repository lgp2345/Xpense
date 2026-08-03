import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dashboard } from "./dashboard";
import { analyticsData, overviewData, recentSales } from "./dashboard-data";

describe("Dashboard", () => {
  it("renders translated fixed dashboard data without unused upstream controls", () => {
    render(<Dashboard />);

    expect(screen.getByText("总收入")).toBeVisible();
    expect(screen.getByText("¥45,231.89")).toBeVisible();
    expect(screen.getByText("近期销售")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reports" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("exposes identical fixed overview chart data across renders", () => {
    const firstRender = render(<Dashboard />);
    const firstChart = within(firstRender.container).getByRole("img", { name: /月度收入趋势/ });

    const secondRender = render(<Dashboard />);
    const secondChart = within(secondRender.container).getByRole("img", { name: /月度收入趋势/ });

    expect(firstChart).toHaveAttribute("aria-label", secondChart.getAttribute("aria-label"));
    expect(firstChart).toHaveAttribute("aria-label", expect.stringContaining("1月: 2400"));
    expect(firstChart).toHaveAttribute("aria-label", expect.stringContaining("12月: 7200"));
  });

  it("exports immutable dashboard fixtures", () => {
    expect(Object.isFrozen(overviewData)).toBe(true);
    expect(Object.isFrozen(overviewData[0])).toBe(true);
    expect(Object.isFrozen(recentSales)).toBe(true);
    expect(Object.isFrozen(recentSales[0])).toBe(true);
    expect(Object.isFrozen(analyticsData)).toBe(true);
    expect(Object.isFrozen(analyticsData.traffic)).toBe(true);
    expect(Object.isFrozen(analyticsData.traffic[0])).toBe(true);
  });

  it("switches to the analytics tab", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("tab", { name: "分析" }));

    expect(screen.getByRole("heading", { name: "访问趋势" })).toBeVisible();
  });
});
