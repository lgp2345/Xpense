import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalSettlementDetail, RentalSettlementPreview } from "@xpense/shared";
import { expect, it, vi } from "vitest";
import { financeApiFixture } from "../bills/bill-test-fixtures";
import { SettlementEditor } from "./settlement-editor";

function renderEditor(api: ReturnType<typeof financeApiFixture>, canConfirm = true) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettlementEditor
        organizationId="org-a"
        contractId="contract-a"
        permissions={canConfirm ? ["rental_settlements:confirm"] : []}
        api={api}
      />
    </QueryClientProvider>,
  );
}

it("服务器预览缺少终读数时阻止确认，补齐后使用同一版本和不可变请求确认", async () => {
  const readyPreview: RentalSettlementPreview = {
    version: "preview-v2",
    canConfirm: true,
    missingFields: [],
    effectiveEndDate: "2026-09-30",
    billChanges: [],
    finalCostMinor: 100_000,
    receivedMinor: 0,
    refundedMinor: 0,
    differenceMinor: 100_000,
  };
  const api = financeApiFixture({
    previewSettlement: vi
      .fn()
      .mockResolvedValueOnce({
        ...readyPreview,
        canConfirm: false,
        missingFields: ["waterReading"],
      })
      .mockResolvedValueOnce(readyPreview),
    confirmSettlement: vi.fn().mockResolvedValue(
      settlementFixture({
        balance: {
          receivedMinor: 0,
          refundedMinor: 0,
          netReceivedMinor: 0,
          outstandingMinor: 100_000,
          refundableMinor: 0,
          state: "unpaid",
          overdue: false,
          version: "settlement-v1",
        },
        finalCostMinor: 100_000,
        status: "pending_collection",
      }),
    ),
  });
  renderEditor(api);

  await userEvent.click(await screen.findByRole("button", { name: "预览结算" }));
  expect(await screen.findByText("水表终读数尚未填写。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认结算" })).toBeDisabled();

  fireEvent.change(screen.getByLabelText("水表终读数"), { target: { value: "125.5" } });
  await userEvent.click(screen.getByRole("button", { name: "预览结算" }));
  expect(await screen.findByText("最终差额 1,000.00")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "确认结算" }));

  expect(api.confirmSettlement).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      contractId: "contract-a",
      finalReadings: [{ kind: "water", readingDate: "2026-09-30", reading: "125.5" }],
      extraFees: [],
      expectedVersion: "preview-v2",
    }),
  );
  const [request] = (api.confirmSettlement as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
  expect(request).toHaveProperty("idempotencyKey", expect.any(String));
});

it("服务器标记终止日期尚未来到时，即使读数齐全也不能提前确认", async () => {
  const api = financeApiFixture({
    previewSettlement: vi.fn().mockResolvedValue({
      version: "preview-future",
      canConfirm: false,
      missingFields: [],
      effectiveEndDate: "2026-12-01",
      billChanges: [],
      finalCostMinor: 100_000,
      receivedMinor: 0,
      refundedMinor: 0,
      differenceMinor: 100_000,
    }),
    confirmSettlement: vi.fn(),
  });
  renderEditor(api);

  await userEvent.click(await screen.findByRole("button", { name: "预览结算" }));

  expect(
    await screen.findByRole("heading", { name: "结算预览 · 截至 2026-12-01" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认结算" })).toBeDisabled();
  expect(api.confirmSettlement).not.toHaveBeenCalled();
});

it("没有结算确认权限时不发送需确认权限的预览请求", async () => {
  const api = financeApiFixture({
    previewSettlement: vi.fn().mockResolvedValue({
      version: "preview-no-confirm",
      canConfirm: true,
      missingFields: [],
      effectiveEndDate: "2026-09-30",
      billChanges: [],
      finalCostMinor: 0,
      receivedMinor: 0,
      refundedMinor: 0,
      differenceMinor: 0,
    }),
    confirmSettlement: vi.fn(),
  });
  renderEditor(api, false);

  await userEvent.click(await screen.findByRole("button", { name: "预览结算" }));
  expect(api.previewSettlement).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "预览结算" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "确认结算" })).toBeDisabled();
});

it("预览在途时改变费用，迟到的旧预览不能复活确认或提交旧费用", async () => {
  let resolvePreview: (preview: RentalSettlementPreview) => void = () => undefined;
  const pending = new Promise<RentalSettlementPreview>((resolve) => {
    resolvePreview = resolve;
  });
  const ready = {
    version: "ready-v1",
    canConfirm: true,
    missingFields: [],
    effectiveEndDate: "2026-09-30",
    billChanges: [],
    finalCostMinor: 0,
    receivedMinor: 0,
    refundedMinor: 0,
    differenceMinor: 0,
  } satisfies RentalSettlementPreview;
  const api = financeApiFixture({
    previewSettlement: vi.fn().mockReturnValueOnce(pending).mockResolvedValue(ready),
    confirmSettlement: vi.fn().mockResolvedValue(settlementFixture()),
  });
  renderEditor(api);
  await userEvent.click(screen.getByRole("button", { name: "预览结算" }));
  await userEvent.type(screen.getByLabelText("退租补充费用"), "新费用");
  await userEvent.type(screen.getByLabelText("补充费用金额（元）"), "100");
  await act(async () => {
    resolvePreview(ready);
  });
  expect(screen.getByRole("button", { name: "确认结算" })).toBeDisabled();
  expect(
    screen.queryByRole("heading", { name: "结算预览 · 截至 2026-09-30" }),
  ).not.toBeInTheDocument();
  expect(api.confirmSettlement).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "预览结算" }));
  expect(
    await screen.findByRole("heading", { name: "结算预览 · 截至 2026-09-30" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "确认结算" }));
  expect(api.confirmSettlement).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      extraFees: [expect.objectContaining({ name: "新费用", amountMinor: 10_000 })],
    }),
  );
});

it("只填补充费用金额时就近显示名称配对错误且不发送预览", async () => {
  const api = financeApiFixture();
  renderEditor(api);
  await userEvent.type(screen.getByLabelText("补充费用金额（元）"), "12");
  await userEvent.click(screen.getByRole("button", { name: "预览结算" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("补充费用名称和金额需要同时填写。");
  expect(screen.getByLabelText("退租补充费用")).toHaveAttribute("aria-invalid", "true");
  expect(api.previewSettlement).not.toHaveBeenCalled();
});

it("确认在途时锁定草稿和新预览，未知失败后只重试原确认请求", async () => {
  let rejectConfirmation: (error: Error) => void = () => undefined;
  const pending = new Promise<RentalSettlementDetail>((_resolve, reject) => {
    rejectConfirmation = reject;
  });
  const preview = {
    version: "ready-v1",
    canConfirm: true,
    missingFields: [],
    effectiveEndDate: "2026-09-30",
    billChanges: [],
    finalCostMinor: 0,
    receivedMinor: 0,
    refundedMinor: 0,
    differenceMinor: 0,
  } satisfies RentalSettlementPreview;
  const confirmSettlement = vi
    .fn()
    .mockReturnValueOnce(pending)
    .mockResolvedValue(settlementFixture());
  const api = financeApiFixture({
    previewSettlement: vi.fn().mockResolvedValue(preview),
    confirmSettlement,
  });
  renderEditor(api);
  const previewButton = screen.getByRole("button", { name: "预览结算" });
  await userEvent.click(previewButton);
  await screen.findByRole("heading", { name: "结算预览 · 截至 2026-09-30" });
  await userEvent.click(screen.getByRole("button", { name: "确认结算" }));
  expect(screen.getByRole("textbox", { name: "退租补充费用" })).toBeDisabled();
  await userEvent.type(screen.getByRole("textbox", { name: "退租补充费用" }), "新费用");
  await userEvent.type(screen.getByLabelText("补充费用金额（元）"), "100");
  expect(screen.getByLabelText("补充费用金额（元）")).toHaveValue("");
  expect(previewButton).toBeDisabled();
  await userEvent.click(previewButton);
  await userEvent.click(screen.getByRole("button", { name: "确认结算" }));
  expect(api.previewSettlement).toHaveBeenCalledTimes(1);
  expect(confirmSettlement).toHaveBeenCalledTimes(1);
  await act(async () => {
    rejectConfirmation(new Error("network"));
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("结算确认结果暂未确认");
  expect(screen.getByRole("textbox", { name: "退租补充费用" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "确认结算" }));
  expect(confirmSettlement).toHaveBeenCalledTimes(2);
  expect(confirmSettlement.mock.calls[1]?.[0]).toEqual(confirmSettlement.mock.calls[0]?.[0]);
});

function settlementFixture(
  overrides: Partial<RentalSettlementDetail> = {},
): RentalSettlementDetail {
  return {
    id: "settlement-a",
    contractId: "contract-a",
    eventId: "event-a",
    kind: "termination",
    effectiveEndDate: "2026-09-30",
    version: "settlement-v1",
    revision: 1,
    finalCostMinor: 0,
    balance: {
      receivedMinor: 0,
      refundedMinor: 0,
      netReceivedMinor: 0,
      outstandingMinor: 0,
      refundableMinor: 0,
      state: "settled",
      overdue: false,
      version: "settlement-cash-v1",
    },
    status: "settled",
    confirmedAt: "2026-09-30T00:00:00.000Z",
    confirmedByUserId: "user-a",
    ...overrides,
  };
}
