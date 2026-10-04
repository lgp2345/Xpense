import { describe, expect, it } from "vitest";
import { defaultContractFormValues } from "./contract-form-schema";
import { contractFieldErrors, validateContractValues } from "./contract-validation-errors";

describe("contractFieldErrors", () => {
  it("空间步骤按合同模式校验数量，并将错误归到空间字段", () => {
    const values = {
      ...defaultContractFormValues("11111111-1111-4111-8111-111111111111"),
      spaces: [
        { spaceId: "22222222-2222-4222-8222-222222222222", rentAllocationText: "" },
        { spaceId: "33333333-3333-4333-8333-333333333333", rentAllocationText: "" },
      ],
    };
    const result = validateContractValues(values, 0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(contractFieldErrors(result.error.issues)).toEqual({ spaces: "合同只能选择一个空间" });
    }
    expect(validateContractValues({ ...values, billingMode: "legacy_receivable" }, 0).success).toBe(
      true,
    );
  });
  it("preserves nested row paths and the first message for each field", () => {
    expect(
      contractFieldErrors([
        { path: ["deposits", 0, "fixedAmountText"], message: "请输入金额" },
        { path: ["deposits", 1, "customName"], message: "请输入押金名称" },
        { path: ["startDate"], message: "日期无效" },
        { path: ["startDate"], message: "请选择日期" },
      ]),
    ).toEqual({
      "deposits.0.fixedAmountText": "请输入金额",
      "deposits.1.customName": "请输入押金名称",
      startDate: "日期无效",
    });
  });
});
