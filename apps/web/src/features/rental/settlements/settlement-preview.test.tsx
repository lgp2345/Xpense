import { render, screen } from "@testing-library/react";
import type { RentalSettlementPreview } from "@xpense/shared";
import { expect, it } from "vitest";
import { SettlementPreview } from "./settlement-preview";

it("分别显示月度费用、退租补充费用与结束月后的账单撤回", () => {
  const preview: RentalSettlementPreview = {
    version: "preview-v1",
    canConfirm: true,
    missingFields: [],
    effectiveEndDate: "2026-09-30",
    billChanges: [
      {
        billId: "bill-september",
        billingMonth: "2026-09",
        lines: [
          {
            kind: "water",
            label: "水费",
            amountMinor: 3_000,
            periodStart: "2026-09-01",
            periodEnd: "2026-09-30",
            referenceStart: null,
            referenceEnd: null,
            coveredDays: null,
            referenceDays: null,
            baseRentAmountMinor: null,
            sortOrder: 0,
          },
          {
            kind: "extra_fee",
            label: "结清清洁费",
            amountMinor: 4_000,
            periodStart: null,
            periodEnd: null,
            referenceStart: null,
            referenceEnd: null,
            coveredDays: null,
            referenceDays: null,
            baseRentAmountMinor: null,
            sortOrder: 1,
            feeSnapshot: {
              kind: "extra_fee",
              extraFeeId: "00000000-0000-4000-8000-000000000001",
              origin: "settlement",
            },
          },
        ],
        amountMinor: 7_000,
        changeAmountMinor: 2_000,
      },
      {
        billId: "bill-october",
        billingMonth: "2026-10",
        lines: [],
        amountMinor: 0,
        changeAmountMinor: -50_000,
      },
    ],
    finalCostMinor: 7_000,
    receivedMinor: 20_000,
    refundedMinor: 0,
    differenceMinor: -13_000,
  };

  render(<SettlementPreview preview={preview} />);

  expect(screen.getByRole("heading", { name: "月度费用" })).toBeInTheDocument();
  expect(screen.getByText(/水费/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "退租补充费用" })).toBeInTheDocument();
  expect(screen.getByText(/结清清洁费/)).toBeInTheDocument();
  expect(screen.getByText("2026-10 · 本次撤回")).toBeInTheDocument();
  expect(screen.getByText("实际收款 200.00")).toBeInTheDocument();
  expect(screen.getByText("实际退款 0.00")).toBeInTheDocument();
  expect(screen.getByText("最终差额 -130.00")).toBeInTheDocument();
});

it("有缺失终读数时明确列出尚未补齐项目", () => {
  const preview: RentalSettlementPreview = {
    version: "preview-v1",
    canConfirm: false,
    missingFields: ["waterReading"],
    effectiveEndDate: "2026-09-30",
    billChanges: [],
    finalCostMinor: 0,
    receivedMinor: 0,
    refundedMinor: 0,
    differenceMinor: 0,
  };

  render(<SettlementPreview preview={preview} />);

  expect(screen.getByText("水表终读数尚未填写。")).toBeInTheDocument();
});
