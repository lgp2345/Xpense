import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeterReadingFields } from "./meter-reading-fields";
import type { MonthlyBillDraft } from "./monthly-bill-form";

describe("月度账单抄表字段", () => {
  it("分别编辑两类读数和实际抄表日期", () => {
    const readings: MonthlyBillDraft["readings"] = {
      water: { readingDate: "2026-08-30", reading: "110" },
      electricity: { readingDate: "2026-08-30", reading: "260" },
    };
    const onChange = vi.fn();
    render(<MeterReadingFields readings={readings} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("水表读数"), { target: { value: "112.5" } });
    expect(onChange).toHaveBeenCalledWith("water", "reading", "112.5");
    expect(screen.getByLabelText("电表读数")).toHaveValue("260");
  });
});
