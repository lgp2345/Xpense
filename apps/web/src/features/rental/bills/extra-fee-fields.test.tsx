import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExtraFeeFields } from "./extra-fee-fields";

describe("月度账单额外费用字段", () => {
  it("保留负金额输入和独立备注", () => {
    const fees = [{ id: "fee-1", name: "水电冲减", amount: "-100", note: "上期多收" }];
    const onChange = vi.fn();
    render(<ExtraFeeFields fees={fees} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("额外费用金额（元） 1"), {
      target: { value: "-125.50" },
    });
    expect(onChange).toHaveBeenCalledWith([
      { id: "fee-1", name: "水电冲减", amount: "-125.50", note: "上期多收" },
    ]);
    expect(screen.getByLabelText("额外费用备注 1")).toHaveValue("上期多收");
  });
});
