import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { ContractFormValues } from "../contract-form-schema";
import { ContractDepositFields } from "./contract-deposit-fields";

function Harness() {
  const [deposits, setDeposits] = useState<ContractFormValues["deposits"]>([]);
  return <ContractDepositFields deposits={deposits} onChange={setDeposits} />;
}

describe("押金事项名称唯一", () => {
  it("输入以默认名称开头的自定义名称时不抢走焦点", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "租金" }));
    await user.click(screen.getByRole("button", { name: "添加自定义押金项" }));
    const input = screen.getByLabelText("押金名称 2");
    await user.type(input, "租金押金");
    expect(input).toHaveValue("租金押金");
    expect(input).toHaveFocus();
  });
  it.each(["租金", "门禁卡"])("%s只能添加一次，移除后可重新添加", async (name) => {
    const user = userEvent.setup();
    render(<Harness />);
    const add = screen.getByRole("button", { name });
    await user.click(add);
    expect(add).toBeDisabled();
    await user.click(add);
    expect(screen.getAllByLabelText(/押金金额/)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "移除押金 1" }));
    expect(add).toBeEnabled();
  });
  it("自定义押金与默认项重名时立即提示，修改后恢复", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "租金" }));
    await user.click(screen.getByRole("button", { name: "添加自定义押金项" }));
    const input = screen.getByLabelText("押金名称 2");
    await user.type(input, " 租金 ");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("押金事项名称不能重复");
    await user.clear(input);
    await user.type(input, "钥匙");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
