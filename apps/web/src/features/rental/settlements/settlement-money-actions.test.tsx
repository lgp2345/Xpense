import { render, screen } from "@testing-library/react";
import type { RentalSettlementDetail } from "@xpense/shared";
import { expect, it } from "vitest";
import { SettlementMoneySummary } from "./settlement-money-actions";

it("分别显示结算实际收退与仍待退款状态", () => {
  render(<SettlementMoneySummary settlement={settlementFixture()} />);

  expect(screen.getByText("已收 3,000.00 · 已退 0.00")).toBeInTheDocument();
  expect(
    screen.getByText(/结算已确认（2026-09-30）；合同空间已按日期结束，仍待退款 2,800.00。/),
  ).toBeInTheDocument();
});

function settlementFixture(): RentalSettlementDetail {
  return {
    id: "settlement-a",
    contractId: "contract-a",
    eventId: "termination-a",
    kind: "termination",
    effectiveEndDate: "2026-09-30",
    version: "settlement-v1",
    revision: 1,
    finalCostMinor: 20_000,
    balance: {
      receivedMinor: 300_000,
      refundedMinor: 0,
      netReceivedMinor: 300_000,
      outstandingMinor: 0,
      refundableMinor: 280_000,
      state: "refundable",
      overdue: false,
      version: "settlement-cash-v1",
    },
    status: "pending_refund",
    confirmedAt: "2026-09-30T00:00:00.000Z",
    confirmedByUserId: "user-a",
  };
}
