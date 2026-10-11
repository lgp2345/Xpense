import { render, screen } from "@testing-library/react";
import type { RentalBillLine, RentalPeriodBillPreview } from "@xpense/shared";
import { expect, it } from "vitest";
import { chargeTermsFixture } from "./bill-test-fixtures";
import { PeriodBillPreview } from "./period-bill-preview";

const rentLine: RentalBillLine = {
  kind: "rent_period",
  label: "月度租金",
  amountMinor: 33873,
  periodStart: "2026-10-11",
  periodEnd: "2026-10-31",
  referenceStart: "2026-10-01",
  referenceEnd: "2026-10-31",
  coveredDays: 21,
  referenceDays: 31,
  baseRentAmountMinor: 50000,
  sortOrder: 0,
};
function preview(lines: RentalBillLine[]): RentalPeriodBillPreview {
  return {
    version: "preview",
    period: { periodStart: "2026-10-11", periodEnd: "2026-10-31" },
    dueDate: "2026-10-11",
    defaults: chargeTermsFixture,
    baselineReadings: [],
    defaultReadings: [],
    lines,
    amountMinor: lines.reduce((total, line) => total + line.amountMinor, 0),
    missingFields: [],
    canConfirm: true,
  };
}

it("不足完整账期时展示完整租金、日单价乘天数及服务端金额", () => {
  render(<PeriodBillPreview preview={preview([rentLine])} />);
  expect(screen.getByText("月度租金（完整账期租金 500.00 元）")).toBeInTheDocument();
  expect(screen.getByText("16.13 元/天 × 21 天 = 338.73 元")).toBeInTheDocument();
});

it("以服务端参考天数展示闰月单价，完整期和其他费用保持原展示", () => {
  render(
    <PeriodBillPreview
      preview={preview([
        {
          ...rentLine,
          baseRentAmountMinor: 29000,
          referenceDays: 29,
          coveredDays: 10,
          amountMinor: 10000,
        },
        { ...rentLine, referenceDays: 31, coveredDays: 31, amountMinor: 50000, sortOrder: 1 },
        { ...rentLine, kind: "fixed_fee", label: "管理费", amountMinor: 5000, sortOrder: 2 },
      ])}
    />,
  );
  expect(screen.getByText("月度租金（完整账期租金 290.00 元）")).toBeInTheDocument();
  expect(screen.getByText("10.00 元/天 × 10 天 = 100.00 元")).toBeInTheDocument();
  expect(screen.getByText("月度租金")).toBeInTheDocument();
  expect(screen.getByText("管理费")).toBeInTheDocument();
  expect(screen.getByText("500.00")).toBeInTheDocument();
});

it("缺少计费参考数据的旧条目保留金额，不推算天数", () => {
  render(
    <PeriodBillPreview
      preview={preview([{ ...rentLine, referenceDays: null, baseRentAmountMinor: null }])}
    />,
  );
  expect(screen.getByText("月度租金")).toBeInTheDocument();
  expect(screen.getByText("338.73")).toBeInTheDocument();
  expect(screen.queryByText(/元\/天/)).not.toBeInTheDocument();
});
