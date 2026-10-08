import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  fireEvent.change(screen.getByLabelText("付款截止日"), { target: { value: "2026/10/20" } });
  fireEvent.blur(screen.getByLabelText("付款截止日"));
  await waitFor(() =>
    expect(h.api.previewPeriodBill).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: "2026-10-20" }),
      expect.anything(),
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "重新预览" }));
  await waitFor(() => expect(screen.getByLabelText("付款截止日")).toHaveValue("2026/10/20"));
});
it("接续选择要求起算读数并提示线下已结清", async () => {
  const h = setup();
  await screen.findByLabelText("出账账期");
  fireEvent.change(screen.getByLabelText("出账账期"), { target: { value: "2026-11-05" } });
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
it("额外费用错误就近显示，备注要求保留", async () => {
  setup();
  await screen.findByLabelText("水表读数");
  await userEvent.click(screen.getByRole("button", { name: "添加额外费用" }));
  fireEvent.change(screen.getByLabelText("额外费用金额（元） 1"), { target: { value: "-20" } });
  expect(screen.getByText("请输入额外费用名称。")).toBeInTheDocument();
  expect(screen.getByText("请输入额外费用备注。")).toBeInTheDocument();
});
it("冲突不自动提交下一期，网络未知重试使用原请求", async () => {
  const api = financeApiFixture({
    generatePeriodBill: vi.fn().mockRejectedValue(new ApiError("冲突", 409, "CONFLICT")),
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
