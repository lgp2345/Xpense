import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ContractChargeFields } from "./contract-charge-fields";
import { type ContractChargeFormValues, defaultContractChargeValues } from "./contract-charge-form";

function Harness({
  initial = defaultContractChargeValues(),
}: {
  initial?: ContractChargeFormValues;
}) {
  const [value, onChange] = useState(initial);
  return <ContractChargeFields value={value} onChange={onChange} />;
}
describe("共用月度收费字段", () => {
  it("默认事项添加后禁用，再移除后可重新添加", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const add = screen.getByRole("button", { name: "管理费" });
    await user.click(add);
    expect(add).toBeDisabled();
    await user.click(add);
    expect(screen.getAllByLabelText(/事项名称/)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "移除事项 1" }));
    expect(add).toBeEnabled();
  });

  it("自定义事项与默认事项重名时提示，改名后清除提示", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "管理费" }));
    await user.click(screen.getByRole("button", { name: "添加其他事项" }));
    const input = screen.getByLabelText("事项名称 2");
    await user.type(input, " 管理费 ");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("固定收费事项名称不能重复");
    await user.clear(input);
    await user.type(input, "停车费");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["管理费", "网费", "清洁费"])("锁定默认%s名称，同时允许修改金额和移除", async (name) => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name }));
    const input = screen.getByLabelText("事项名称 1");
    expect(input).toHaveAttribute("readonly");
    await user.type(input, "改名");
    expect(input).toHaveValue(name);
    await user.type(screen.getByLabelText("月费金额 1"), "25.50");
    expect(screen.getByLabelText("月费金额 1")).toHaveValue("25.50");
    await user.click(screen.getByRole("button", { name: "移除事项 1" }));
    expect(screen.queryByLabelText("事项名称 1")).not.toBeInTheDocument();
  });

  it("自定义事项即使与默认名称相同也可以继续编辑", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "添加其他事项" }));
    const input = screen.getByLabelText("事项名称 1");
    await user.type(input, "管理费");
    await user.clear(input);
    await user.type(input, "停车费");
    expect(input).toHaveValue("停车费");
    expect(input).not.toHaveAttribute("readonly");
  });

  it("回填已有默认月费时仍锁定名称，自定义名称保持可编辑", () => {
    render(
      <Harness
        initial={{
          ...defaultContractChargeValues(),
          fixedFees: [
            { id: "management", name: "管理费", amount: "50" },
            { id: "parking", name: "停车费", amount: "100" },
          ],
        }}
      />,
    );
    expect(screen.getByLabelText("事项名称 1")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("事项名称 2")).not.toHaveAttribute("readonly");
  });

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
