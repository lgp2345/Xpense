import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UpdateRentalMeterBaselineRequest } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../services/api-client";
import {
  chargeTermsFixture,
  financeApiFixture,
  meterBaselineFixture,
} from "../bills/bill-test-fixtures";
import { MeterBaselineForm } from "./meter-baseline-form";

describe("入住水电底数", () => {
  it("只提交本次修改的底数和原因，并携带服务端版本", async () => {
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
        readings: [{ kind: "water", readingDate: "2026-01-01", reading: "101.5" }],
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
    await user.clear(screen.getByLabelText("水表底数"));
    await user.type(screen.getByLabelText("水表底数"), "101");
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
    await user.clear(screen.getByLabelText("水表底数"));
    await user.type(screen.getByLabelText("水表底数"), "101");
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

it("只登记代收水表，未填写电表不阻止保存", async () => {
  const user = userEvent.setup();
  const api = financeApiFixture();
  render(
    <MeterBaselineForm
      organizationId="org"
      contractId="contract"
      api={api}
      baseline={{
        ...meterBaselineFixture,
        readings: meterBaselineFixture.readings.filter((reading) => reading.kind === "water"),
      }}
      terms={{ ...chargeTermsFixture, electricityCollectionEnabled: false }}
      onSaved={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText("电表底数")).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("水表底数"));
  await user.type(screen.getByLabelText("水表底数"), "0");
  await user.type(screen.getByLabelText("底数变更原因"), "交房");
  await user.click(screen.getByRole("button", { name: "保存入住底数" }));
  expect(api.updateMeterBaseline).toHaveBeenCalledWith(
    expect.objectContaining({ readings: [expect.objectContaining({ kind: "water" })] }),
  );
});

it.each([
  "water",
  "electricity",
] as const)("补录%s真实零底数时不回传另一类已使用底数", async (kind) => {
  const user = userEvent.setup();
  const api = financeApiFixture({
    updateMeterBaseline: vi.fn(async (input: UpdateRentalMeterBaselineRequest) => {
      if (input.readings.some((reading) => reading.kind !== kind))
        throw new ApiError(409, "CONFLICT", "入住底数已用于账单，需通过读数更正处理");
      return meterBaselineFixture;
    }),
  });
  const onSaved = vi.fn();
  render(
    <MeterBaselineForm
      organizationId="org"
      contractId="contract"
      api={api}
      baseline={{
        ...meterBaselineFixture,
        readings: meterBaselineFixture.readings.filter((reading) => reading.kind !== kind),
      }}
      terms={chargeTermsFixture}
      onSaved={onSaved}
    />,
  );
  const label = kind === "water" ? "水表" : "电表";
  await user.type(screen.getByLabelText(`${label}底数日期`), "2026-01-01");
  await user.type(screen.getByLabelText(`${label}底数`), "0");
  await user.type(screen.getByLabelText("底数变更原因"), "首次补录");
  await user.click(screen.getByRole("button", { name: "保存入住底数" }));
  expect(api.updateMeterBaseline).toHaveBeenCalledWith(
    expect.objectContaining({ readings: [{ kind, readingDate: "2026-01-01", reading: "0" }] }),
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
});

it("未改变底数及十进制等值输入不产生底数更新", async () => {
  const user = userEvent.setup();
  const api = financeApiFixture();
  render(
    <MeterBaselineForm
      organizationId="org"
      contractId="contract"
      api={api}
      baseline={meterBaselineFixture}
      terms={chargeTermsFixture}
      onSaved={vi.fn()}
    />,
  );
  await user.type(screen.getByLabelText("底数变更原因"), "复核");
  expect(screen.getByRole("button", { name: "保存入住底数" })).toBeDisabled();
  await user.clear(screen.getByLabelText("电表底数"));
  await user.type(screen.getByLabelText("电表底数"), "250.0000");
  expect(screen.getByRole("button", { name: "保存入住底数" })).toBeDisabled();
  expect(api.updateMeterBaseline).not.toHaveBeenCalled();
});

it.each([
  "入住底数已用于账单，需通过读数更正处理",
  "水电读数来源已变化，请重新读取后再保存",
])("底数冲突显示实际处理要求：%s", async (message) => {
  const user = userEvent.setup();
  const api = financeApiFixture({
    updateMeterBaseline: vi.fn().mockRejectedValue(new ApiError(409, "CONFLICT", message)),
  });
  const onSaved = vi.fn();
  render(
    <MeterBaselineForm
      organizationId="org"
      contractId="contract"
      api={api}
      baseline={meterBaselineFixture}
      onSaved={onSaved}
    />,
  );
  await user.clear(screen.getByLabelText("水表底数"));
  await user.type(screen.getByLabelText("水表底数"), "101");
  await user.type(screen.getByLabelText("底数变更原因"), "交接复核");
  await user.click(screen.getByRole("button", { name: "保存入住底数" }));
  expect(await screen.findByText(message, { selector: "[role=alert]" })).toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
});
