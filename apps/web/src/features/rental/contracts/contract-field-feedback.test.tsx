import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContractFieldErrorsContext, ContractFieldFocusContext } from "./contract-field-feedback";
import { defaultContractFormValues } from "./contract-form-schema";
import { ContractTermsStep } from "./steps/contract-terms-step";

describe("contract field feedback", () => {
  it("keeps focus in the input when revalidation changes the remaining errors", () => {
    const values = defaultContractFormValues();
    const view = (errors: Record<string, string>, focus: boolean) => (
      <ContractFieldFocusContext value={focus}>
        <ContractFieldErrorsContext value={errors}>
          <ContractTermsStep values={values} onChange={vi.fn()} />
        </ContractFieldErrorsContext>
      </ContractFieldFocusContext>
    );
    const { rerender } = render(view({ rentAmountText: "租金无效", endDate: "日期无效" }, true));
    const rent = screen.getByRole("textbox", { name: "月租（元）" });
    rent.focus();
    rerender(view({ endDate: "日期无效" }, false));
    expect(rent).toHaveFocus();
    expect(screen.getByText("日期无效")).toBeInTheDocument();
  });

  it("shows date range and dynamic deposit errors below their own controls", () => {
    const values = defaultContractFormValues();
    values.deposits = [
      {
        type: "other",
        customName: "",
        calculationMode: "fixed_amount",
        fixedAmountText: "",
        rentMultipleText: "",
      },
    ];
    render(
      <ContractFieldErrorsContext
        value={{
          endDate: "日期范围无效",
          "deposits.0.customName": "请输入押金名称",
          "deposits.0.fixedAmountText": "金额无效",
        }}
      >
        <ContractTermsStep values={values} onChange={vi.fn()} />
      </ContractFieldErrorsContext>,
    );
    const range = screen.getByRole("button", { name: "租期范围" });
    expect(range).toHaveAttribute("aria-describedby", "contract-startDate-error");
    expect(screen.getByText("日期范围无效")).toHaveFocus();
    const name = screen.getByLabelText("押金名称");
    const amount = screen.getByRole("textbox", { name: "固定金额" });
    expect(name.parentElement).toHaveTextContent("请输入押金名称");
    expect(amount.parentElement).toHaveTextContent("金额无效");
    expect(screen.getByText("金额无效").closest('[data-slot="field-error"]')).toBeInTheDocument();
  });
});
