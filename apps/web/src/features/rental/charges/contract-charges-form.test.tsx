import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { chargeTermsFixture, financeApiFixture } from "../bills/bill-test-fixtures";
import { ContractChargesForm } from "./contract-charges-form";

describe("合同收费标准表单", () => {
  it("提交带版本、原因和原固定费用标识的收费更新", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture();
    render(
      <ContractChargesForm
        organizationId="org"
        contractId="contract"
        api={api}
        terms={chargeTermsFixture}
        onSaved={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText("水费单价（元）"));
    await user.type(screen.getByLabelText("水费单价（元）"), "3.25");
    await user.type(screen.getByLabelText("收费标准变更原因"), "供应商调价");
    await user.click(screen.getByRole("button", { name: "保存收费标准" }));

    expect(api.updateChargeTerms).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: "contract",
        expectedVersion: "charges-v1",
        reason: "供应商调价",
        waterUnitPrice: "3.25",
        fixedFees: [
          { id: "11111111-1111-4111-8111-111111111111", name: "物业费", monthlyAmountMinor: 50000 },
        ],
      }),
    );
  });

  it("缺少变更原因时禁止保存", () => {
    render(
      <ContractChargesForm
        organizationId="org"
        contractId="contract"
        api={financeApiFixture()}
        terms={chargeTermsFixture}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "保存收费标准" })).toBeDisabled();
  });

  it("保留固定月费的逐键金额中间态，并将无效金额定位到字段", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture();
    render(
      <ContractChargesForm
        organizationId="org"
        contractId="contract"
        api={api}
        terms={chargeTermsFixture}
        onSaved={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText("月费金额 1");
    await user.clear(amount);
    await user.type(amount, "12.");
    expect(amount).toHaveValue("12.");

    await user.click(screen.getByRole("button", { name: "保存收费标准" }));
    expect(
      await screen.findByText("请输入非负且最多两位小数的月费金额", { selector: "[role=alert]" }),
    ).toBeInTheDocument();
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(api.updateChargeTerms).not.toHaveBeenCalled();
  });

  it("收费更新未知结果重试原键，修改内容后创建新尝试", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      updateChargeTerms: vi.fn().mockRejectedValueOnce(new Error("response lost")),
    });
    render(
      <ContractChargesForm
        organizationId="org"
        contractId="contract"
        api={api}
        terms={chargeTermsFixture}
        onSaved={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("收费标准变更原因"), "供应商调价");
    const save = screen.getByRole("button", { name: "保存收费标准" });
    await user.click(save);
    expect(await screen.findByText("保存结果暂未确认，可重试原请求。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试原请求" }));
    await waitFor(() => expect(api.updateChargeTerms).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.updateChargeTerms).mock.calls[1]?.[0]).toEqual(
      vi.mocked(api.updateChargeTerms).mock.calls[0]?.[0],
    );

    await user.type(screen.getByLabelText("收费标准变更原因"), "，补充");
    await user.click(screen.getByRole("button", { name: "保存收费标准" }));
    await waitFor(() => expect(api.updateChargeTerms).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api.updateChargeTerms).mock.calls[2]?.[0].idempotencyKey).not.toBe(
      vi.mocked(api.updateChargeTerms).mock.calls[1]?.[0].idempotencyKey,
    );
  });

  it("收费更新卸载后忽略迟到成功回调", async () => {
    const user = userEvent.setup();
    let resolveUpdate!: () => void;
    const api = financeApiFixture({
      updateChargeTerms: vi.fn(
        () =>
          new Promise<typeof chargeTermsFixture>(
            (resolve) => (resolveUpdate = () => resolve(chargeTermsFixture)),
          ),
      ),
    });
    const onSaved = vi.fn();
    const view = render(
      <ContractChargesForm
        organizationId="org-a"
        contractId="contract"
        api={api}
        terms={chargeTermsFixture}
        onSaved={onSaved}
      />,
    );
    await user.type(screen.getByLabelText("收费标准变更原因"), "供应商调价");
    await user.click(screen.getByRole("button", { name: "保存收费标准" }));
    await waitFor(() => expect(api.updateChargeTerms).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      resolveUpdate();
      await Promise.resolve();
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("安全整数上界附近的固定月费回填与提交仍精确保留最小单位", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture();
    const terms = {
      ...chargeTermsFixture,
      fixedFees: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "大额费用",
          monthlyAmountMinor: 9007199254740990,
        },
      ],
    };
    render(
      <ContractChargesForm
        organizationId="org"
        contractId="contract"
        api={api}
        terms={terms}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("月费金额 1")).toHaveValue("90071992547409.90");
    await user.type(screen.getByLabelText("收费标准变更原因"), "复核");
    await user.click(screen.getByRole("button", { name: "保存收费标准" }));
    await waitFor(() =>
      expect(api.updateChargeTerms).toHaveBeenCalledWith(
        expect.objectContaining({
          fixedFees: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              name: "大额费用",
              monthlyAmountMinor: 9007199254740990,
            },
          ],
        }),
      ),
    );
  });
});
