import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { financeApiFixture, meterBaselineFixture } from "../bills/bill-test-fixtures";
import { MeterBaselineForm } from "./meter-baseline-form";

describe("入住水电底数", () => {
  it("新底数必须有两个读数和原因，并携带服务端版本提交", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture();
    render(
      <MeterBaselineForm
        organizationId="org"
        contractId="contract"
        api={api}
        baseline={meterBaselineFixture}
        onSaved={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText("水表底数"));
    await user.type(screen.getByLabelText("水表底数"), "101.5");
    await user.type(screen.getByLabelText("底数变更原因"), "交接复核");
    await user.click(screen.getByRole("button", { name: "保存入住底数" }));

    expect(api.updateMeterBaseline).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: "contract",
        expectedVersion: "meters-v1",
        reason: "交接复核",
        readings: expect.arrayContaining([
          expect.objectContaining({ kind: "water", reading: "101.5" }),
          expect.objectContaining({ kind: "electricity", reading: "250" }),
        ]),
      }),
    );
  });

  it("缺少原因时不允许确认新底数", () => {
    render(
      <MeterBaselineForm
        organizationId="org"
        contractId="contract"
        api={financeApiFixture()}
        baseline={meterBaselineFixture}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "保存入住底数" })).toBeDisabled();
  });

  it("底数更新未知结果重试完整原请求和幂等键", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      updateMeterBaseline: vi.fn().mockRejectedValueOnce(new Error("response lost")),
    });
    render(
      <MeterBaselineForm
        organizationId="org"
        contractId="contract"
        api={api}
        baseline={meterBaselineFixture}
        onSaved={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("底数变更原因"), "交接复核");
    await user.click(screen.getByRole("button", { name: "保存入住底数" }));
    expect(await screen.findByText("保存结果暂未确认，可重试原请求。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试原请求" }));
    await waitFor(() => expect(api.updateMeterBaseline).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.updateMeterBaseline).mock.calls[1]?.[0]).toEqual(
      vi.mocked(api.updateMeterBaseline).mock.calls[0]?.[0],
    );
    await user.type(screen.getByLabelText("底数变更原因"), "，补充");
    await user.click(screen.getByRole("button", { name: "保存入住底数" }));
    await waitFor(() => expect(api.updateMeterBaseline).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api.updateMeterBaseline).mock.calls[2]?.[0].idempotencyKey).not.toBe(
      vi.mocked(api.updateMeterBaseline).mock.calls[1]?.[0].idempotencyKey,
    );
  });

  it("底数格式错误定位到读数且不提交", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture();
    render(
      <MeterBaselineForm
        organizationId="org"
        contractId="contract"
        api={api}
        baseline={meterBaselineFixture}
        onSaved={vi.fn()}
      />,
    );
    const reading = screen.getByLabelText("水表底数");
    await user.clear(reading);
    await user.type(reading, "1.23456");
    expect(
      await screen.findByText("请输入最多四位小数的水表底数。", { selector: "[role=alert]" }),
    ).toBeInTheDocument();
    expect(reading).toHaveAttribute("aria-invalid", "true");
    expect(api.updateMeterBaseline).not.toHaveBeenCalled();
  });

  it("底数表单卸载后忽略迟到成功回调", async () => {
    const user = userEvent.setup();
    let resolveUpdate!: () => void;
    const api = financeApiFixture({
      updateMeterBaseline: vi.fn(
        () =>
          new Promise<typeof meterBaselineFixture>(
            (resolve) => (resolveUpdate = () => resolve(meterBaselineFixture)),
          ),
      ),
    });
    const onSaved = vi.fn();
    const view = render(
      <MeterBaselineForm
        organizationId="org-a"
        contractId="contract"
        api={api}
        baseline={meterBaselineFixture}
        onSaved={onSaved}
      />,
    );
    await user.type(screen.getByLabelText("底数变更原因"), "交接复核");
    await user.click(screen.getByRole("button", { name: "保存入住底数" }));
    await waitFor(() => expect(api.updateMeterBaseline).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      resolveUpdate();
      await Promise.resolve();
    });
    expect(onSaved).not.toHaveBeenCalled();
  });
});
