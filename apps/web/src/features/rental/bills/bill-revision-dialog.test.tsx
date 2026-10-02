import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RentalBillDetail, RentalBillLine } from "@xpense/shared";
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

const [lineTemplate] = currentBill.lines;
if (!lineTemplate) throw new Error("测试账单应包含费用行");

const meteredBill = {
  ...currentBill,
  lines: [
    ...currentBill.lines,
    {
      ...lineTemplate,
      kind: "water" as const,
      label: "水费",
      amountMinor: 1500,
      periodStart: "2026-08-31",
      periodEnd: "2026-09-30",
      feeSnapshot: {
        kind: "water" as const,
        startReadingId: "00000000-0000-4000-8000-000000000010",
        endReadingId: "00000000-0000-4000-8000-000000000011",
        startDate: "2026-08-31",
        endDate: "2026-09-30",
        startReading: "100.0000",
        endReading: "115.0000",
        unitPrice: "1.0000",
        overrideReason: null,
      },
    },
    {
      ...lineTemplate,
      kind: "fixed_fee" as const,
      label: "物业费",
      amountMinor: 3000,
      coveredDays: 30,
      referenceDays: 30,
      feeSnapshot: {
        kind: "fixed_fee" as const,
        feeId: "00000000-0000-4000-8000-000000000012",
        monthlyAmountMinor: 3000,
        overrideReason: null,
      },
    },
  ],
};

function renderMeterRevision(
  api: ReturnType<typeof financeApiFixture>,
  bill: RentalBillDetail = meteredBill,
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BillRevisionDialog
        organizationId="org"
        bill={bill}
        api={api}
        billsApi={billsApiFixture()}
        permissions={["rental_bills:read", "rental_monthly_bills:adjust"]}
        open
        onOpenChange={vi.fn()}
        onAdjusted={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("历史读数与非租金费用更正", () => {
  it("从保存快照更正水表读数，显示相邻两期及结算差额，原价保持", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      previewBillRevision: vi.fn().mockResolvedValue({
        ...revisionPreview,
        affectedBills: [
          { billId: "bill", beforeAmountMinor: 100000, afterAmountMinor: 100150 },
          { billId: "next-bill", beforeAmountMinor: 90000, afterAmountMinor: 89700 },
        ],
        settlementDifferenceMinor: -150,
      }),
      adjustBill: vi.fn().mockResolvedValue(revisionPreview),
    });
    renderMeterRevision(api);
    expect(screen.getByLabelText("水费单价（元）")).toHaveValue("1.0000");
    const reading = screen.getByLabelText("本次水表读数");
    await user.clear(reading);
    await user.type(reading, "116.5");
    await user.type(screen.getByLabelText("账单更正原因"), "核对原始抄表记录");
    await waitFor(() =>
      expect(api.previewBillRevision).toHaveBeenLastCalledWith(
        expect.objectContaining({
          readings: [{ kind: "water", readingDate: "2026-09-30", reading: "116.5" }],
        }),
        expect.anything(),
      ),
    );
    expect(vi.mocked(api.previewBillRevision).mock.lastCall?.[0].overrides).toBeUndefined();
    expect(screen.getAllByText(/应收.*→/)).toHaveLength(2);
    expect(screen.getByText(/结算差额/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认更正" }));
    await waitFor(() =>
      expect(api.adjustBill).toHaveBeenCalledWith(
        expect.objectContaining({
          readings: [{ kind: "water", readingDate: "2026-09-30", reading: "116.5" }],
          expectedVersion: "revision-preview-v2",
          reason: "核对原始抄表记录",
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(api.getChargeTerms).not.toHaveBeenCalled();
  });

  it("只覆盖明确更正的历史单价和固定月额，按原ID提交且不改读数", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      previewBillRevision: vi.fn().mockResolvedValue(revisionPreview),
    });
    renderMeterRevision(api);
    const price = screen.getByLabelText("水费单价（元）");
    const fixed = screen.getByLabelText("固定月费（元） 1");
    await user.clear(price);
    await user.type(price, "2.50");
    await user.clear(fixed);
    await user.type(fixed, "35.25");
    await user.type(screen.getByLabelText("账单更正原因"), "更正当月保存价格");
    await waitFor(() =>
      expect(api.previewBillRevision).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overrides: {
            waterUnitPrice: "2.50",
            fixedFees: [{ id: "00000000-0000-4000-8000-000000000012", monthlyAmountMinor: 3525 }],
            reason: "更正当月保存价格",
          },
        }),
        expect.anything(),
      ),
    );
    expect(vi.mocked(api.previewBillRevision).mock.lastCall?.[0].readings).toBeUndefined();
    expect(screen.queryByLabelText(/租金金额/)).not.toBeInTheDocument();
  });

  it("两段水费保持不同旧价，共用读数及明确统一改价按真实边界提交", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({
      previewBillRevision: vi.fn().mockResolvedValue(revisionPreview),
    });
    const multiBill = {
      ...meteredBill,
      lines: meteredBill.lines.flatMap<RentalBillLine>((line) => {
        if (line.feeSnapshot.kind !== "water") return [line];
        const saved = line.feeSnapshot;
        return [
          {
            ...line,
            feeSnapshot: {
              ...saved,
              endReadingId: "middle",
              endReading: "110",
              endDate: "2026-09-10",
              unitPrice: "1",
            },
          },
          {
            ...line,
            feeSnapshot: {
              ...saved,
              startReadingId: "middle",
              startReading: "110",
              startDate: "2026-09-10",
              endReadingId: "final",
              endReading: "115",
              endDate: "2026-09-20",
              unitPrice: "2",
            },
          },
        ];
      }),
    };
    renderMeterRevision(api, multiBill);
    expect(screen.getByLabelText("水费单价（元）（区间 1）")).toHaveValue("1");
    expect(screen.getByLabelText("水费单价（元）（区间 2）")).toHaveValue("2");
    expect(screen.getByLabelText("本次水表读数日期（区间 2）")).toBeDisabled();
    await user.type(screen.getByLabelText("账单更正原因"), "核实多段计量");
    await waitFor(() => expect(api.previewBillRevision).toHaveBeenCalled());
    expect(vi.mocked(api.previewBillRevision).mock.lastCall?.[0].overrides).toBeUndefined();
    const boundary = screen.getByLabelText("本次水表读数（区间 1）");
    await user.clear(boundary);
    await user.type(boundary, "111");
    expect(screen.getByLabelText("上次水表读数（区间 2）")).toHaveValue("111");
    const price = screen.getByLabelText("水费单价（元）（区间 1）");
    await user.clear(price);
    await user.type(price, "2.50");
    expect(screen.getByLabelText("水费单价（元）（区间 2）")).toHaveValue("2.50");
    await waitFor(() =>
      expect(api.previewBillRevision).toHaveBeenLastCalledWith(
        expect.objectContaining({
          readings: [{ kind: "water", readingDate: "2026-09-10", reading: "111" }],
          overrides: { waterUnitPrice: "2.50", reason: "核实多段计量" },
        }),
        expect.anything(),
      ),
    );
  });

  it("将非法读数精度与负单价、负固定月额定位到字段且不请求预览", async () => {
    const user = userEvent.setup();
    const api = financeApiFixture({ previewBillRevision: vi.fn() });
    renderMeterRevision(api);
    for (const [label, value] of [
      ["本次水表读数", "115.00001"],
      ["水费单价（元）", "-1"],
      ["固定月费（元） 1", "-2"],
    ] as const) {
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
      expect(field).toHaveAttribute("aria-invalid", "true");
    }
    await user.type(screen.getByLabelText("账单更正原因"), "纠正录入");
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("button", { name: "确认更正" })).toBeDisabled();
    expect(api.previewBillRevision).not.toHaveBeenCalled();
  });
});

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
