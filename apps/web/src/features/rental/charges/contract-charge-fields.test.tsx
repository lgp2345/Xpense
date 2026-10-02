import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ContractChargeFields } from "./contract-charge-fields";
import { defaultContractChargeValues } from "./contract-charge-form";

function Harness() {
  const [value, onChange] = useState(defaultContractChargeValues());
  return <ContractChargeFields value={value} onChange={onChange} />;
}
describe("共用月度收费字段", () => {
  it("分别切换代收并动态添加常用月费", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByLabelText("水费单价（元）")).toBeInTheDocument();
    await user.click(screen.getByLabelText("房东代收水费"));
    expect(screen.queryByLabelText("水费单价（元）")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "管理费" }));
    expect(screen.getByLabelText("事项名称 1")).toHaveValue("管理费");
    await user.type(screen.getByLabelText("月费金额 1"), "50");
    expect(screen.getByLabelText("月费金额 1")).toHaveValue("50");
    await user.click(screen.getByRole("button", { name: "移除事项 1" }));
    expect(screen.queryByLabelText("事项名称 1")).not.toBeInTheDocument();
  });
});
