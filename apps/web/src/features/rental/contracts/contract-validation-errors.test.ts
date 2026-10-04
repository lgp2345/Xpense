import { describe, expect, it } from "vitest";
import { contractFieldErrors } from "./contract-validation-errors";

describe("contractFieldErrors", () => {
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
