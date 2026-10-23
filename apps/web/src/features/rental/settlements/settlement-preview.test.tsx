import { screen } from "@testing-library/react";
import type { RentalBillLine, RentalSettlementPreview } from "@xpense/shared";
import { expect, it } from "vitest";
import { render } from "@/test/render-with-currency";
import { SettlementPreview } from "./settlement-preview";

const line = (
  kind: RentalBillLine["kind"],
  label: string,
  amountMinor: number,
): RentalBillLine => ({
  kind,
  label,
  amountMinor,
  periodStart: null,
  periodEnd: null,
  referenceStart: null,
  referenceEnd: null,
  coveredDays: null,
  referenceDays: null,
  baseRentAmountMinor: null,
  sortOrder: 0,
});
const empty: RentalSettlementPreview = {
  version: "v1",
  canConfirm: true,
  missingFields: [],
  effectiveEndDate: "2026-09-30",
  periodCharges: [],
  terminalLines: [],
  extraLines: [],
  finalCostMinor: 7000,
  receivedMinor: 20000,
  refundedMinor: 0,
  differenceMinor: -13000,
};
it("分别显示账期费用、尾期水电、手动退款事项与真实资金", () => {
  render(
    <SettlementPreview
      preview={{
        ...empty,
        periodCharges: [
          {
            billId: "bill",
            period: { periodStart: "2026-09-01", periodEnd: "2026-09-30" },
            lines: [line("rent_period", "租金", 5000)],
            amountMinor: 5000,
          },
        ],
        terminalLines: [line("water", "水费", 3000)],
        extraLines: [line("extra_fee", "管理费退款", -1000)],
      }}
    />,
  );
  for (const name of ["账期费用", "尾期水电", "固定费用退款事项与额外费用"])
    expect(screen.getByRole("heading", { name })).toBeInTheDocument();
  expect(screen.getByText(/管理费退款/)).toBeInTheDocument();
  expect(screen.getByText(/固定费用不自动退款/)).toBeInTheDocument();
  expect(screen.getByText("实际收款 ¥200.00")).toBeInTheDocument();
  expect(screen.getByText("实际退款 ¥0.00")).toBeInTheDocument();
  expect(screen.getByText("最终差额 -¥130.00")).toBeInTheDocument();
  expect(screen.queryByText(/本次撤回/)).not.toBeInTheDocument();
});
it("有缺失终读数时明确列出尚未补齐项目", () => {
  render(
    <SettlementPreview
      preview={{ ...empty, canConfirm: false, missingFields: ["waterReading"] }}
    />,
  );
  expect(screen.getByText("水表终读数尚未填写。")).toBeInTheDocument();
});
