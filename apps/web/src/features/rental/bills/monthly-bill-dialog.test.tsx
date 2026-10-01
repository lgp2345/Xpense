import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalBillLine, RentalMonthlyBillPreview } from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { financeApiFixture } from "./bill-test-fixtures";
import { MonthlyBillDialog } from "./monthly-bill-dialog";

const preview = {
  version: "preview-1",
  canConfirm: true,
  missingFields: [],
  defaults: {
    contractId: "contract",
    version: "charges-v1",
    waterUnitPrice: "3.0000",
    electricityUnitPrice: "4.0000",
    fixedFees: [],
  },
  baselineReadings: [
    { kind: "water" as const, readingDate: "2026-01-01", reading: "100" },
    { kind: "electricity" as const, readingDate: "2026-01-01", reading: "200" },
  ],
  lines: [],
  amountMinor: 123400,
  billingMonth: "2026-08",
  existingBillId: null,
};

function meterIntervalLine(
  kind: "water" | "electricity",
  startReading: string,
  endReading: string,
  startDate: string,
  endDate: string,
  sortOrder: number,
): RentalBillLine {
  return {
    kind,
    label: kind === "water" ? "水费" : "电费",
    amountMinor: 3500,
    periodStart: startDate,
    periodEnd: endDate,
    referenceStart: startDate,
    referenceEnd: endDate,
    coveredDays: null,
    referenceDays: null,
    baseRentAmountMinor: null,
    sortOrder,
    feeSnapshot: {
      kind,
      startReadingId: `${kind}-start`,
      endReadingId: `${kind}-end`,
      startDate,
      endDate,
      startReading,
      endReading,
      unitPrice: kind === "water" ? "3.0000" : "4.0000",
      overrideReason: null,
    },
  };
}

function previewWithMeterInterval(
  billingMonth: string,
  version: string,
  startDate: string,
  waterStart: string,
  electricityStart: string,
  endDate: string,
  waterEnd: string,
  electricityEnd: string,
): RentalMonthlyBillPreview {
  return {
    ...preview,
    billingMonth,
    version,
    amountMinor: 8750,
    baselineReadings: [
      { kind: "water", readingDate: "2026-01-01", reading: "100" },
      { kind: "electricity", readingDate: "2026-01-01", reading: "50" },
    ],
    lines: [
      meterIntervalLine("water", waterStart, waterEnd, startDate, endDate, 1),
      meterIntervalLine("electricity", electricityStart, electricityEnd, startDate, endDate, 2),
    ],
  };
}

function renderDialog(api = financeApiFixture()) {
  const onOpenChange = vi.fn();
  const view = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MonthlyBillDialog
        organizationId="org-a"
        contractId="contract"
        api={api}
        open
        onOpenChange={onOpenChange}
        onGenerated={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { ...view, onOpenChange };
}

async function completeRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText("账单月份"), { target: { value: "2026-08" } });
  fireEvent.change(screen.getByLabelText("账单到期日"), { target: { value: "2026-08-31" } });
  fireEvent.change(screen.getByLabelText("水表读数日期"), { target: { value: "2026-08-30" } });
  await user.type(screen.getByLabelText("水表读数"), "110");
  fireEvent.change(screen.getByLabelText("电表读数日期"), { target: { value: "2026-08-30" } });
  await user.type(screen.getByLabelText("电表读数"), "260");
}

describe("月度综合账单", () => {
  it("金额和抄表缺项时禁止确认，租金保持只读", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
    expect(screen.queryByLabelText("租金金额")).not.toBeInTheDocument();
    expect(screen.getByText(/租金由服务端按合同计算/)).toBeInTheDocument();
  });

  it("明确将原始水电读数标为入住底数", async () => {
    const api = financeApiFixture({
      getMeterBaseline: vi.fn().mockResolvedValue({
        contractId: "contract",
        version: "meters-v1",
        readings: [
          { kind: "water", readingDate: "2026-01-01", reading: "100" },
          { kind: "electricity", readingDate: "2026-01-01", reading: "50" },
        ],
      }),
    });
    renderDialog(api);

    expect(await screen.findByText("合同收费依据与入住底数")).toBeInTheDocument();
    expect(screen.getByText("入住水表底数 100 · 2026-01-01")).toBeInTheDocument();
    expect(screen.getByText("入住电表底数 50 · 2026-01-01")).toBeInTheDocument();
    expect(screen.queryByText(/上次[水电]表读数/)).not.toBeInTheDocument();
  });

  it("显示当前服务端预览的计量起始读数，输入改变时清除旧区间并采用新预览", async () => {
    let resolveOctoberPreview: (value: RentalMonthlyBillPreview) => void = () => {
      throw new Error("十月预览尚未开始");
    };
    const api = financeApiFixture({
      getMeterBaseline: vi.fn().mockResolvedValue({
        contractId: "contract",
        version: "meters-v1",
        readings: [
          { kind: "water", readingDate: "2026-01-01", reading: "100" },
          { kind: "electricity", readingDate: "2026-01-01", reading: "50" },
        ],
      }),
      previewMonthlyBill: vi
        .fn()
        .mockResolvedValueOnce(
          previewWithMeterInterval(
            "2026-09",
            "september",
            "2026-08-31",
            "110",
            "60",
            "2026-09-30",
            "120",
            "70",
          ),
        )
        .mockImplementationOnce(
          () =>
            new Promise<RentalMonthlyBillPreview>((resolve) => {
              resolveOctoberPreview = resolve;
            }),
        ),
    });
    const user = userEvent.setup();
    renderDialog(api);

    fireEvent.change(screen.getByLabelText("账单月份"), { target: { value: "2026-09" } });
    fireEvent.change(screen.getByLabelText("账单到期日"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("水表读数日期"), { target: { value: "2026-09-30" } });
    await user.type(screen.getByLabelText("水表读数"), "120");
    fireEvent.change(screen.getByLabelText("电表读数日期"), { target: { value: "2026-09-30" } });
    await user.type(screen.getByLabelText("电表读数"), "70");

    expect(await screen.findByText("本期水表起始读数 110 · 2026-08-31")).toBeInTheDocument();
    expect(screen.getByText("本期电表起始读数 60 · 2026-08-31")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("账单月份"), { target: { value: "2026-10" } });
    fireEvent.change(screen.getByLabelText("账单到期日"), { target: { value: "2026-10-31" } });
    fireEvent.change(screen.getByLabelText("水表读数日期"), { target: { value: "2026-10-31" } });
    fireEvent.change(screen.getByLabelText("水表读数"), { target: { value: "130" } });
    fireEvent.change(screen.getByLabelText("电表读数日期"), { target: { value: "2026-10-31" } });
    fireEvent.change(screen.getByLabelText("电表读数"), { target: { value: "80" } });

    expect(screen.queryByText("本期水表起始读数 110 · 2026-08-31")).not.toBeInTheDocument();
    expect(screen.queryByText("本期电表起始读数 60 · 2026-08-31")).not.toBeInTheDocument();
    await waitFor(() => expect(api.previewMonthlyBill).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("本期水表起始读数 110 · 2026-08-31")).not.toBeInTheDocument();

    await act(async () => {
      resolveOctoberPreview(
        previewWithMeterInterval(
          "2026-10",
          "october",
          "2026-09-30",
          "120",
          "70",
          "2026-10-31",
          "130",
          "80",
        ),
      );
    });

    expect(await screen.findByText("本期水表起始读数 120 · 2026-09-30")).toBeInTheDocument();
    expect(screen.getByText("本期电表起始读数 70 · 2026-09-30")).toBeInTheDocument();
    expect(screen.queryByText("本期水表起始读数 110 · 2026-08-31")).not.toBeInTheDocument();
  });

  it("无效水表读数和额外费用金额就近显示字段错误且不请求预览", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture();
    renderDialog(api);
    await user.type(screen.getByLabelText("水表读数"), "not-a-reading");

    expect(
      await screen.findByText("请输入最多四位小数的水表读数。", { selector: "[role=alert]" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("水表读数")).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "添加额外费用" }));
    await user.type(screen.getByLabelText("额外费用名称 1"), "物业调整");
    await user.type(screen.getByLabelText("额外费用金额（元） 1"), "1.234");
    expect(
      await screen.findByText("请输入有效费用金额。", { selector: "[role=alert]" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("额外费用金额（元） 1")).toHaveAttribute("aria-invalid", "true");
    expect(api.previewMonthlyBill).not.toHaveBeenCalled();
    expect(api.generateMonthlyBill).not.toHaveBeenCalled();
  });

  it("将 -100 元及备注提交到新服务端预览，再使用该预览版本确认", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      previewMonthlyBill: vi.fn().mockResolvedValue(preview),
      generateMonthlyBill: vi.fn().mockResolvedValue({ ...preview, id: "bill-created" }),
    });
    renderDialog(api);
    await completeRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "添加额外费用" }));
    await user.type(screen.getByLabelText("额外费用名称 1"), "水电调整");
    await user.type(screen.getByLabelText("额外费用金额（元） 1"), "-100");
    await user.type(screen.getByLabelText("额外费用备注 1"), "上期多收冲减");

    await waitFor(() => expect(api.previewMonthlyBill).toHaveBeenCalled());
    expect(api.previewMonthlyBill).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFees: [
          { id: expect.any(String), name: "水电调整", amountMinor: -10000, note: "上期多收冲减" },
        ],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(await screen.findByText("服务端预览金额 CNY 1,234.00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认生成" }));
    await waitFor(() =>
      expect(api.generateMonthlyBill).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedVersion: "preview-1",
          extraFees: [
            { id: expect.any(String), name: "水电调整", amountMinor: -10000, note: "上期多收冲减" },
          ],
        }),
      ),
    );
  });

  it("修改输入后立刻使旧预览失效，等新服务端结果再确认", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({ previewMonthlyBill: vi.fn().mockResolvedValue(preview) });
    renderDialog(api);
    await completeRequiredFields(user);
    await screen.findByText("服务端预览金额 CNY 1,234.00");
    const reading = screen.getByLabelText("水表读数");
    await user.clear(reading);
    await user.type(reading, "111");
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
    await waitFor(() => expect(api.previewMonthlyBill).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "确认生成" })).toBeEnabled();
  });

  it("在读数输入框按 Enter 提交已通过预览的月账", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      previewMonthlyBill: vi.fn().mockResolvedValue(preview),
      generateMonthlyBill: vi.fn().mockResolvedValue({ ...preview, id: "bill-created" }),
    });
    renderDialog(api);
    await completeRequiredFields(user);
    await screen.findByText("服务端预览金额 CNY 1,234.00");
    await user.type(screen.getByLabelText("电表读数"), "{Enter}");
    await waitFor(() => expect(api.generateMonthlyBill).toHaveBeenCalledOnce());
  });

  it("忽略较早输入的迟到预览结果", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: typeof preview) => void;
    let resolveSecond!: (value: typeof preview) => void;
    const api = financeApiFixture({
      previewMonthlyBill: vi
        .fn()
        .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
        .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve))),
    });
    renderDialog(api);
    await completeRequiredFields(user);
    await waitFor(() => expect(api.previewMonthlyBill).toHaveBeenCalledTimes(1));

    const reading = screen.getByLabelText("水表读数");
    await user.clear(reading);
    await user.type(reading, "111");
    await waitFor(() => expect(api.previewMonthlyBill).toHaveBeenCalledTimes(2));

    resolveSecond({ ...preview, version: "newer", amountMinor: 222200 });
    expect(await screen.findByText("服务端预览金额 CNY 2,222.00")).toBeInTheDocument();
    resolveFirst({ ...preview, version: "older", amountMinor: 111100 });
    await waitFor(() =>
      expect(screen.getByText("服务端预览金额 CNY 2,222.00")).toBeInTheDocument(),
    );
    expect(screen.queryByText("服务端预览金额 CNY 1,111.00")).not.toBeInTheDocument();
  });

  it("未知网络结果重试原请求；输入变更后使用新幂等键", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      previewMonthlyBill: vi.fn().mockResolvedValue(preview),
      generateMonthlyBill: vi
        .fn()
        .mockRejectedValueOnce(new Error("network unavailable"))
        .mockResolvedValue({ ...preview, id: "bill-created" }),
    });
    const generateMonthlyBill = vi.mocked(api.generateMonthlyBill);
    renderDialog(api);
    await completeRequiredFields(user);
    await screen.findByText("服务端预览金额 CNY 1,234.00");

    const confirm = screen.getByRole("button", { name: "确认生成" });
    await user.click(confirm);
    expect(await screen.findByText("确认结果暂未确认，可重试原请求。")).toBeInTheDocument();
    await user.click(confirm);
    await waitFor(() => expect(generateMonthlyBill).toHaveBeenCalledTimes(2));
    const firstAttempt = generateMonthlyBill.mock.calls[0]?.[0];
    const retriedAttempt = generateMonthlyBill.mock.calls[1]?.[0];
    expect(retriedAttempt).toEqual(firstAttempt);
    if (!firstAttempt) throw new Error("Expected the first confirmation request");

    const reading = screen.getByLabelText("水表读数");
    await user.clear(reading);
    await user.type(reading, "111");
    await waitFor(() => expect(api.previewMonthlyBill).toHaveBeenCalledTimes(2));
    await screen.findByText("服务端预览金额 CNY 1,234.00");
    await user.click(confirm);
    await waitFor(() => expect(generateMonthlyBill).toHaveBeenCalledTimes(3));
    const changedAttempt = generateMonthlyBill.mock.calls[2]?.[0];
    if (!changedAttempt) throw new Error("Expected the changed confirmation request");
    expect(changedAttempt).not.toEqual(firstAttempt);
    expect(changedAttempt.idempotencyKey).not.toBe(firstAttempt.idempotencyKey);
  });
});
