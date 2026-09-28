import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseTerminationAmount } from "./bill-generation-form";
import { TerminationBillingFields } from "./termination-billing-fields";

describe("整期最终应收", () => {
  it("零金额合法，拒绝负数和浮点不精确输入，理由必填", () => {
    expect(parseTerminationAmount("0")).toBe(0);
    expect(parseTerminationAmount("0.01")).toBe(1);
    expect(parseTerminationAmount("-1")).toBeNull();
    expect(parseTerminationAmount("0.001")).toBeNull();
    expect(parseTerminationAmount("900719925474099.99")).toBeNull();
  });
  it("展示原始、参考和最终整期金额并输出合法确认", () => {
    const change = vi.fn();
    render(
      <TerminationBillingFields
        preview={{
          periodStart: "2026-01-01",
          periodEnd: "2026-03-31",
          originalAmountMinor: 900000,
          referenceAmountMinor: 450000,
          version: "v",
          affectedBillCount: 2,
          requiresConfirmation: true,
        }}
        amountText="0"
        reason="协商免除"
        onAmountChange={vi.fn()}
        onReasonChange={change}
      />,
    );
    expect(screen.getByLabelText("终止当期最终应收")).toHaveValue("0");
    expect(screen.getByText(/原始应收/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("金额确认原因"), { target: { value: "新原因" } });
    expect(change).toHaveBeenCalledWith("新原因");
  });
});
