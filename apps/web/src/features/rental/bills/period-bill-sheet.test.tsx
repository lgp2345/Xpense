import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ApiError } from "../../../services/api-client";
import { billFixture, financeApiFixture, periodContextFixture } from "./bill-test-fixtures";
import { PeriodBillSheet } from "./period-bill-sheet";

function setup(api = financeApiFixture(), expectedPeriodStart = "2026-10-05") {
  const props = {
    organizationId: "org",
    contractId: "contract",
    api,
    open: true,
    onOpenChange: vi.fn(),
    onGenerated: vi.fn(),
    onContextChanged: vi.fn(),
    spaceLabel: "楼栋 / 101",
    tenantNames: ["张三"],
    expectedPeriodStart,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PeriodBillSheet {...props} />
    </QueryClientProvider>,
  );
  return {
    ...view,
    props,
    api,
    rerenderSheet: (patch: Partial<typeof props>) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <PeriodBillSheet {...props} {...patch} />
        </QueryClientProvider>,
      ),
  };
}
it("真正右侧 Sheet 保留表单，成功回调完整账单并关闭", async () => {
  const h = setup();
  await screen.findByLabelText("水表读数");
  expect(screen.getByRole("dialog")).toHaveAttribute("data-slot", "sheet-content");
  expect(screen.getByText(/楼栋 \/ 101/)).toBeInTheDocument();
  expect(screen.getByLabelText("备注")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  expect(h.props.onGenerated).toHaveBeenCalledWith(billFixture);
  expect(h.props.onOpenChange).toHaveBeenCalledWith(false);
});
it("取消不生成", async () => {
  const h = setup();
  await screen.findByLabelText("水表读数");
  await userEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(h.api.generatePeriodBill).not.toHaveBeenCalled();
});
it("账期变化不装入另一账期", async () => {
  const h = setup(financeApiFixture(), "2026-09-05");
  await screen.findByText("待出账账期已变化，关闭窗口后可查看最新账期。");
  expect(screen.queryByLabelText("水表读数")).not.toBeInTheDocument();
  expect(h.api.previewPeriodBill).not.toHaveBeenCalled();
  await waitFor(() => expect(h.props.onContextChanged).toHaveBeenCalledTimes(1));
});
it("加载失败仍用 Sheet", async () => {
  setup(
    financeApiFixture({ getPeriodBillContext: vi.fn().mockRejectedValue(new Error("failed")) }),
  );
  await screen.findByRole("alert");
  expect(screen.getByRole("dialog")).toHaveAttribute("data-slot", "sheet-content");
});
it("网络未知重试原请求，提交中 Esc 与关闭不能丢会话", async () => {
  let resolve: (value: typeof billFixture) => void = () => {};
  const generate = vi
    .fn()
    .mockRejectedValueOnce(new Error("network"))
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
  const h = setup(financeApiFixture({ generatePeriodBill: generate }));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await screen.findByText("确认结果暂未确认，可重试原请求。");
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(h.props.onOpenChange).not.toHaveBeenCalled();
  expect(generate.mock.calls[1]?.[0]).toEqual(generate.mock.calls[0]?.[0]);
  await act(async () => resolve(billFixture));
});
it("409 不自动确认下一期且保留备注", async () => {
  const api = financeApiFixture({
    generatePeriodBill: vi.fn().mockRejectedValue(new ApiError(409, "CONFLICT", "冲突")),
  });
  setup(api);
  await screen.findByLabelText("备注");
  fireEvent.change(screen.getByLabelText("备注"), { target: { value: "保留输入" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "确认生成" }));
  await screen.findByText(/不会自动确认下一期/);
  expect(screen.getByLabelText("备注")).toHaveValue("保留输入");
  expect(api.generatePeriodBill).toHaveBeenCalledTimes(1);
});
it("组织或合同切换清空旧输入", async () => {
  const h = setup();
  await screen.findByLabelText("备注");
  fireEvent.change(screen.getByLabelText("备注"), { target: { value: "旧组织" } });
  h.rerenderSheet({ organizationId: "other", contractId: "other-contract" });
  await waitFor(() => expect(screen.getByLabelText("备注")).toHaveValue(""));
  expect(h.api.getPeriodBillContext).toHaveBeenCalledWith(
    { contractId: "other-contract" },
    expect.anything(),
  );
});
it("晚到预览不能恢复旧金额与版本", async () => {
  let resolveOld: (v: unknown) => void = () => {};
  const normal = financeApiFixture();
  const preview = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveOld = r;
        }),
    )
    .mockImplementation(normal.previewPeriodBill);
  setup(financeApiFixture({ previewPeriodBill: preview }));
  await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("水表读数"), { target: { value: "3501" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "确认生成" })).toBeEnabled());
  await act(async () =>
    resolveOld({
      version: "stale",
      period: periodContextFixture.nextPeriod,
      lines: [],
      amountMinor: 999999,
      missingFields: [],
      canConfirm: true,
    }),
  );
  expect(screen.queryByText(/9999.99/)).not.toBeInTheDocument();
});

it("加载账期后保留同一个 Sheet 面板，不重新挂载打断动画", async () => {
  let resolveContext: (value: typeof periodContextFixture) => void = () => {};
  setup(
    financeApiFixture({
      getPeriodBillContext: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveContext = resolve;
          }),
      ),
    }),
  );
  const panel = await screen.findByRole("dialog");
  expect(screen.getByRole("status")).toHaveTextContent("正在读取下一账期");
  await act(async () => resolveContext(periodContextFixture));
  await screen.findByLabelText("备注");
  expect(screen.getByRole("dialog")).toBe(panel);
});

it("同一合同关闭后再次打开会重新加载并清空本轮输入", async () => {
  const h = setup();
  await screen.findByLabelText("备注");
  fireEvent.change(screen.getByLabelText("备注"), { target: { value: "上轮输入" } });
  await userEvent.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() => expect(h.props.onOpenChange).toHaveBeenCalledWith(false));
  h.rerenderSheet({ open: false });
  h.rerenderSheet({ open: true });
  await waitFor(() => expect(screen.getByLabelText("备注")).toHaveValue(""));
  expect(h.api.getPeriodBillContext).toHaveBeenCalledTimes(2);
});
