import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { render } from "@/test/render-with-currency";
import { ApiError } from "../../../services/api-client";
import { financeApiFixture, periodContextFixture } from "./bill-test-fixtures";
import { PeriodBillDialog } from "./period-bill-dialog";

function setup(api = financeApiFixture()) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    organizationId: "org",
    contractId: "contract",
    api,
    open: true,
    onOpenChange,
    onGenerated: vi.fn(),
  };
  const view = render(
    <QueryClientProvider client={client}>
      <PeriodBillDialog {...props} />
    </QueryClientProvider>,
  );
  return {
    ...view,
    api,
    props,
    client,
    rerenderDialog: (changes: Partial<typeof props>) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <PeriodBillDialog {...props} {...changes} />
        </QueryClientProvider>,
      ),
  };
}
it("打开自动填下一期截止日与默认读数，零用量仍能生成", async () => {
  const h = setup();
  await waitFor(() => expect(screen.getByLabelText("水表读数")).toHaveValue("3500"));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  expect(h.api.generatePeriodBill).toHaveBeenCalledWith(
    expect.objectContaining({
      periodStart: "2026-10-05",
      dueDate: "2026-10-05",
      readings: periodContextFixture.defaultReadings,
      expectedVersion: "preview-v1",
    }),
  );
});
it("修改截止日后刷新预览不覆盖输入", async () => {
  const h = setup();
  await screen.findByLabelText("付款截止日");
  fireEvent.change(screen.getByLabelText("付款截止日"), { target: { value: "2026-10-20" } });
  fireEvent.blur(screen.getByLabelText("付款截止日"));
  await waitFor(() =>
    expect(h.api.previewPeriodBill).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: "2026-10-20" }),
      expect.anything(),
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "重新预览" }));
  await waitFor(() => expect(screen.getByLabelText("付款截止日")).toHaveValue("2026-10-20"));
});
it("接续选择要求起算读数并提示线下已结清", async () => {
  const h = setup();
  await screen.findByLabelText("出账账期");
  await userEvent.click(screen.getByRole("combobox", { name: "出账账期" }));
  await userEvent.click(await screen.findByRole("option", { name: "2026-11-05 至 2026-12-04" }));
  expect(screen.getByText(/视为已在线下结清/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("起算水表读数"), { target: { value: "4200" } });
  fireEvent.change(screen.getByLabelText("起算电表读数"), { target: { value: "50" } });
  await waitFor(() =>
    expect(h.api.previewPeriodBill).toHaveBeenCalledWith(
      expect.objectContaining({
        billingStart: expect.objectContaining({ firstPeriodStart: "2026-11-05" }),
      }),
      expect.anything(),
    ),
  );
});
it("长账期列表滚动到底加载后续选项，选中末期后重新打开仍保留选择", async () => {
  const selectablePeriods = Array.from({ length: 24 }, (_, index) => {
    const month = `${2027 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
    return { periodStart: `${month}-05`, periodEnd: `${month}-28` };
  });
  const h = setup(
    financeApiFixture({
      getPeriodBillContext: vi.fn().mockResolvedValue({
        ...periodContextFixture,
        selectablePeriods: [...periodContextFixture.selectablePeriods, ...selectablePeriods],
      }),
    }),
  );
  await screen.findByLabelText("出账账期");
  expect(screen.queryByRole("button", { name: "上一页账期" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "下一页账期" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("combobox", { name: "出账账期" }));
  const list = await screen.findByRole("listbox");
  expect(screen.getAllByRole("option")).toHaveLength(20);
  expect(
    screen.queryByRole("option", { name: "2028-12-05 至 2028-12-28" }),
  ).not.toBeInTheDocument();
  Object.defineProperties(list, {
    clientHeight: { configurable: true, value: 288 },
    scrollHeight: { configurable: true, value: 960 },
  });
  fireEvent.scroll(list, { target: { scrollTop: 300 } });
  expect(screen.getAllByRole("option")).toHaveLength(20);
  fireEvent.scroll(list, { target: { scrollTop: 660 } });
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(26));
  await userEvent.click(await screen.findByRole("option", { name: "2028-12-05 至 2028-12-28" }));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "出账账期" })).toHaveTextContent("2028-12-05"),
  );
  expect(screen.getByText(/视为已在线下结清/)).toBeInTheDocument();
  expect(h.api.getPeriodBillContext).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("combobox", { name: "出账账期" }));
  expect(await screen.findByRole("option", { name: "2028-12-05 至 2028-12-28" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
it("关闭再打开不调用生成，切换合同读取独立上下文", async () => {
  const h = setup();
  await screen.findByLabelText("水表读数");
  h.rerenderDialog({ open: false });
  h.rerenderDialog({ open: true, contractId: "other" });
  await screen.findByLabelText("水表读数");
  expect(h.api.generatePeriodBill).not.toHaveBeenCalled();
  expect(h.api.getPeriodBillContext).toHaveBeenCalledWith(
    expect.objectContaining({ contractId: "other" }),
    expect.anything(),
  );
});
it("收费事项合并录入，名称和金额错误就近显示", async () => {
  setup();
  await screen.findByLabelText("水表读数");
  expect(screen.getByLabelText("本期物业费金额（CNY）")).toHaveValue("500.00");
  expect(screen.getByLabelText("本期水费单价")).toHaveValue("3.0000");
  expect(screen.getByLabelText("本期电费单价")).toHaveValue("4.0000");
  expect(screen.getByText("上期水表读数")).toBeInTheDocument();
  expect(screen.queryByText("调整本期收费（可选）")).not.toBeInTheDocument();
  expect(screen.queryByText("额外费用")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "添加收费事项" }));
  fireEvent.change(screen.getByLabelText("新增事项金额（CNY） 1"), { target: { value: "-20" } });
  expect(screen.getByText("请输入额外费用名称。")).toBeInTheDocument();
  expect(screen.queryByText("请输入额外费用备注。")).not.toBeInTheDocument();
});
it("本期单价和事项可修改，备注与新增费用随确认请求提交", async () => {
  const h = setup();
  await screen.findByLabelText("本期水费单价");
  fireEvent.change(screen.getByLabelText("本期水费单价"), { target: { value: "5" } });
  expect(screen.getByText("调整本期金额或单价时，请在备注中说明原因。")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("本期物业费金额（CNY）"), { target: { value: "490.50" } });
  await userEvent.click(screen.getByRole("button", { name: "添加收费事项" }));
  fireEvent.change(screen.getByLabelText("新增事项名称 1"), { target: { value: "清洁费" } });
  fireEvent.change(screen.getByLabelText("新增事项金额（CNY） 1"), { target: { value: "20.25" } });
  fireEvent.change(screen.getByLabelText("备注"), { target: { value: "本期协商收费" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  expect(h.api.generatePeriodBill).toHaveBeenCalledWith(
    expect.objectContaining({
      note: "本期协商收费",
      overrides: expect.objectContaining({ waterUnitPrice: "5", reason: "本期协商收费" }),
      extraFees: [expect.objectContaining({ name: "清洁费", amountMinor: 2025 })],
    }),
  );
});
it("水电金额展示服务端最新预览，改读数时清空旧金额", async () => {
  const previewPeriodBill = vi.fn().mockResolvedValue({
    version: "preview-v1",
    period: periodContextFixture.nextPeriod,
    dueDate: "2026-10-05",
    defaults: periodContextFixture.defaults,
    baselineReadings: periodContextFixture.baselineReadings,
    defaultReadings: periodContextFixture.defaultReadings,
    lines: [{ kind: "water", label: "水费", amountMinor: 900, sortOrder: 0 }],
    amountMinor: 900,
    canConfirm: true,
    missingFields: [],
  });
  setup(financeApiFixture({ previewPeriodBill }));
  await waitFor(() => expect(screen.getByLabelText("本期水费")).toHaveTextContent("9.00"));
  fireEvent.change(screen.getByLabelText("水表读数"), { target: { value: "3504" } });
  expect(screen.getByLabelText("本期水费")).not.toHaveTextContent("9.00");
});
it("冲突不自动提交下一期，网络未知重试使用原请求", async () => {
  const api = financeApiFixture({
    generatePeriodBill: vi.fn().mockRejectedValue(new ApiError(409, "CONFLICT", "冲突")),
  });
  setup(api);
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await screen.findByRole("alert");
  expect(api.generatePeriodBill).toHaveBeenCalledTimes(1);
});
it("账期耗尽与读取错误可理解", async () => {
  setup(
    financeApiFixture({
      getPeriodBillContext: vi
        .fn()
        .mockResolvedValue({ ...periodContextFixture, nextPeriod: null, defaultDueDate: null }),
    }),
  );
  await screen.findByText("合同账期已全部生成。");
  expect(screen.queryByRole("button", { name: "确认生成" })).not.toBeInTheDocument();
});
