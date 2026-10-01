import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BillRevisionDialog } from "./bill-revision-dialog";
import { billFixture, billsApiFixture, financeApiFixture } from "./bill-test-fixtures";

const revisionPreview = {
  version: "revision-preview-v2",
  affectedBills: [{ billId: "bill", beforeAmountMinor: 100000, afterAmountMinor: 90000 }],
  settlementDifferenceMinor: null,
};

const currentBill = {
  ...billFixture,
  type: "monthly" as const,
  modelVersion: 2 as const,
  revision: 2,
  financial: {
    receivedMinor: 0,
    refundedMinor: 0,
    netReceivedMinor: 0,
    outstandingMinor: 100000,
    refundableMinor: 0,
    state: "unpaid" as const,
    overdue: false,
    version: "cash-v4",
  },
  lines: [
    {
      kind: "extra_fee" as const,
      label: "月度清洁费",
      amountMinor: 20000,
      periodStart: null,
      periodEnd: null,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 1,
      note: "月度服务",
      feeSnapshot: {
        kind: "extra_fee" as const,
        extraFeeId: "00000000-0000-4000-8000-000000000001",
        origin: "monthly" as const,
      },
    },
    {
      kind: "extra_fee" as const,
      label: "退租补偿",
      amountMinor: -5000,
      periodStart: null,
      periodEnd: null,
      referenceStart: null,
      referenceEnd: null,
      coveredDays: null,
      referenceDays: null,
      baseRentAmountMinor: null,
      sortOrder: 2,
      note: "结算来源",
      feeSnapshot: {
        kind: "extra_fee" as const,
        extraFeeId: "00000000-0000-4000-8000-000000000002",
        origin: "settlement" as const,
      },
    },
  ],
};

describe("账单更正与修订历史", () => {
  it("将无效额外费用金额的错误定位到对应输入框", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillRevisionDialog
          organizationId="org"
          bill={currentBill}
          api={financeApiFixture()}
          billsApi={billsApiFixture()}
          permissions={["rental_bills:read", "rental_monthly_bills:adjust"]}
          open
          onOpenChange={vi.fn()}
          onAdjusted={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const amount = screen.getByLabelText("额外费用金额（元） 1");
    await user.clear(amount);
    await user.type(amount, "invalid");

    expect(
      await screen.findByText("请输入有效费用金额。", { selector: "[role=alert]" }),
    ).toBeInTheDocument();
    expect(amount).toHaveAttribute("aria-invalid", "true");
  });

  it("提交时将缺少的更正原因定位到字段", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillRevisionDialog
          organizationId="org"
          bill={currentBill}
          api={financeApiFixture()}
          billsApi={billsApiFixture()}
          permissions={["rental_bills:read", "rental_monthly_bills:adjust"]}
          open
          onOpenChange={vi.fn()}
          onAdjusted={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText("账单更正原因"), "{Enter}");

    expect(
      await screen.findByText("请输入账单更正原因。", { selector: "[role=alert]" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("账单更正原因")).toHaveAttribute("aria-invalid", "true");
  });

  it("按 Enter 提交已预览的账单更正", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      previewBillRevision: vi.fn().mockResolvedValue(revisionPreview),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillRevisionDialog
          organizationId="org"
          bill={currentBill}
          api={api}
          billsApi={billsApiFixture()}
          permissions={["rental_bills:read", "rental_monthly_bills:adjust"]}
          open
          onOpenChange={vi.fn()}
          onAdjusted={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const reason = screen.getByLabelText("账单更正原因");
    await user.type(reason, "核对后更正");
    await waitFor(() => expect(api.previewBillRevision).toHaveBeenCalled());
    await user.type(reason, "{Enter}");

    await waitFor(() =>
      expect(api.adjustBill).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "核对后更正",
          expectedVersion: "revision-preview-v2",
        }),
      ),
    );
  });

  it("初始化保留全部月度与结算额外费用，并提交负数备注", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      previewBillRevision: vi.fn().mockResolvedValue(revisionPreview),
    });
    const billsApi = billsApiFixture({
      listRevisions: vi.fn().mockResolvedValue({
        items: [
          {
            id: "revision-1",
            billId: "bill",
            revision: 1,
            amountMinor: 100000,
            billSnapshot: { type: "monthly", amountMinor: 100000, dueDate: "2026-08-31" },
            linesSnapshot: [],
            reason: "首次更正",
            createdAt: "2026-08-30T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillRevisionDialog
          organizationId="org"
          bill={currentBill}
          api={api}
          billsApi={billsApi}
          permissions={["rental_bills:read", "rental_monthly_bills:adjust"]}
          open
          onOpenChange={vi.fn()}
          onAdjusted={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("修订历史")).toBeInTheDocument();
    expect(screen.getByText("首次更正")).toBeInTheDocument();
    expect(screen.getByText("退租补偿 · 结算来源")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("额外费用金额（元） 1"));
    await user.type(screen.getByLabelText("额外费用金额（元） 1"), "-100");
    await user.clear(screen.getByLabelText("额外费用备注 1"));
    await user.type(screen.getByLabelText("额外费用备注 1"), "冲减上月多收");
    await user.type(screen.getByLabelText("账单更正原因"), "核对后冲减");

    await waitFor(() => expect(api.previewBillRevision).toHaveBeenCalled());
    const previewInput = vi.mocked(api.previewBillRevision).mock.calls.at(-1)?.[0];
    expect(previewInput?.extraFees).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "月度清洁费",
        amountMinor: -10000,
        note: "冲减上月多收",
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "退租补偿",
        amountMinor: -5000,
        note: "结算来源",
      },
    ]);
    await user.click(await screen.findByRole("button", { name: "确认更正" }));
    await waitFor(() =>
      expect(api.adjustBill).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedVersion: "revision-preview-v2",
          extraFees: expect.arrayContaining([
            expect.objectContaining({ amountMinor: -10000, note: "冲减上月多收" }),
            expect.objectContaining({
              id: "00000000-0000-4000-8000-000000000002",
              amountMinor: -5000,
            }),
          ]),
        }),
      ),
    );
  });

  it("账单详情卸载后忽略迟到的更正成功与旧资源刷新", async () => {
    const user = userEvent.setup();
    let resolveAdjustment!: (preview: typeof revisionPreview) => void;
    const api = financeApiFixture({
      previewBillRevision: vi.fn().mockResolvedValue(revisionPreview),
      adjustBill: vi.fn(
        () => new Promise<typeof revisionPreview>((resolve) => (resolveAdjustment = resolve)),
      ),
    });
    const onAdjusted = vi.fn();
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const view = render(
      <QueryClientProvider client={queryClient}>
        <BillRevisionDialog
          organizationId="org-a"
          bill={currentBill}
          api={api}
          billsApi={billsApiFixture()}
          permissions={["rental_bills:read", "rental_monthly_bills:adjust"]}
          open
          onOpenChange={onOpenChange}
          onAdjusted={onAdjusted}
        />
      </QueryClientProvider>,
    );
    await user.type(screen.getByLabelText("账单更正原因"), "核对后更正");
    await waitFor(() => expect(api.previewBillRevision).toHaveBeenCalled());
    await screen.findByText("服务端更正预览");
    await user.click(screen.getByRole("button", { name: "确认更正" }));
    await waitFor(() => expect(api.adjustBill).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      resolveAdjustment(revisionPreview);
      await Promise.resolve();
    });

    expect(onAdjusted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("更正未知结果重试原内容与原键，改原因后采用新键", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      previewBillRevision: vi.fn().mockResolvedValue(revisionPreview),
      adjustBill: vi.fn().mockRejectedValueOnce(new Error("response lost")),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BillRevisionDialog
          organizationId="org"
          bill={currentBill}
          api={api}
          billsApi={billsApiFixture()}
          permissions={["rental_bills:read", "rental_monthly_bills:adjust"]}
          open
          onOpenChange={vi.fn()}
          onAdjusted={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const reason = screen.getByLabelText("账单更正原因");
    await user.type(reason, "核对后更正");
    await screen.findByText("服务端更正预览");
    await user.click(screen.getByRole("button", { name: "确认更正" }));
    expect(await screen.findByText("确认结果暂未确认，可重试原请求。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认更正" }));
    await waitFor(() => expect(api.adjustBill).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.adjustBill).mock.calls[1]?.[0]).toEqual(
      vi.mocked(api.adjustBill).mock.calls[0]?.[0],
    );
    const original = vi.mocked(api.adjustBill).mock.calls[0]?.[0];
    if (!original) throw new Error("Expected the original adjustment attempt");

    await user.type(reason, "，补充");
    await screen.findByText("服务端更正预览");
    await user.click(screen.getByRole("button", { name: "确认更正" }));
    await waitFor(() => expect(api.adjustBill).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api.adjustBill).mock.calls[2]?.[0].idempotencyKey).not.toBe(
      original.idempotencyKey,
    );
  });
});
