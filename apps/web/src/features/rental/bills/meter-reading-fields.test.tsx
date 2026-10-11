import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeterReadingFields } from "./meter-reading-fields";
import type { PeriodBillDraft } from "./period-bill-form";

describe("月度账单抄表字段", () => {
  it("分别编辑两类读数，不要求输入抄表日期", () => {
    const readings: PeriodBillDraft["readings"] = {
      water: { reading: "110" },
      electricity: { reading: "260" },
    };
    const onChange = vi.fn();
    render(<MeterReadingFields readings={readings} onChange={onChange} />);

    expect(screen.queryByLabelText("水表读数日期")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("水表读数"), { target: { value: "112.5" } });
    expect(onChange).toHaveBeenCalledWith("water", "reading", "112.5");
    expect(screen.getByLabelText("电表读数")).toHaveValue("260");
  });
});
