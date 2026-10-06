import type {
  RentalBillDetail,
  RentalBillSummary,
  RentalCashEntry,
  RentalFinancialBalance,
} from "@xpense/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-client";
import { createRentalBillCashBatchAttempt } from "./rental-bill-cash-batch";
import type { RentalBillsApi } from "./rental-bills-api";
import type { RentalFinanceApi } from "./rental-finance-api";

type FinanceApi = Pick<RentalFinanceApi, "recordReceipt" | "confirmDepositReceipt">;

function balance(overrides: Partial<RentalFinancialBalance> = {}): RentalFinancialBalance {
  return {
    receivedMinor: 0,
    refundedMinor: 0,
    netReceivedMinor: 0,
    outstandingMinor: 1_000,
    refundableMinor: 0,
    state: "unpaid",
    overdue: false,
    version: "snapshot-version",
    ...overrides,
  };
}

function bill(id: string, overrides: Partial<RentalBillSummary> = {}): RentalBillSummary {
  return {
    id,
    billNumber: `RB-${id}`,
    contractId: "contract-1",
    contractNumber: "RC-1",
    propertyId: "property-1",
    propertyName: "测试房产",
    currencyCode: "CNY",
    type: "rent",
    status: "active",
    sourceKey: `rent:${id}`,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    effectiveEnd: "2026-09-30",
    dueDate: "2026-09-10",
    amountMinor: 1_000,
    dueState: "date_passed",
    createdAt: "2026-09-01T00:00:00.000Z",
    modelVersion: 2,
    financial: balance(),
    ...overrides,
  };
}

function detail(summary: RentalBillSummary): RentalBillDetail {
  return {
    ...summary,
    lines: [],
    generationId: null,
    adjustmentId: null,
    adjustment: null,
    snapshot: {
      propertyId: summary.propertyId,
      propertyName: summary.propertyName,
      contractNumber: summary.contractNumber,
      spaces: [],
      parties: [],
    },
    voidReason: null,
    voidedAt: null,
    voidedBy: null,
    history: [],
  };
}

function entry(overrides: Partial<RentalCashEntry> = {}): RentalCashEntry {
  return {
    id: "entry-1",
    contractId: "contract-1",
    target: { kind: "bill", billId: "bill-1" },
    kind: "receipt",
    purpose: "bill_receipt",
    amountMinor: 500,
    occurredOn: "2026-10-01",
    note: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    createdByUserId: "user-1",
    revokedAt: null,
    revokedByUserId: null,
    revokeReason: null,
    ...overrides,
  };
}

function financeApi() {
  return {
    recordReceipt: vi.fn<FinanceApi["recordReceipt"]>(async () => entry()),
    confirmDepositReceipt: vi.fn<FinanceApi["confirmDepositReceipt"]>(async () =>
      entry({ purpose: "deposit_receipt", amountMinor: 1_500 }),
    ),
  } satisfies FinanceApi;
}

function selectedBill(id: string, overrides: Partial<RentalBillSummary> = {}) {
  return bill(id, overrides);
}

describe("租赁账单批量收款", () => {
  it("按每次读取到的合同版本顺序确认押金与普通部分收款", async () => {
    const deposit = selectedBill("deposit-1", {
      type: "deposit",
      amountMinor: 1_500,
      financial: balance({ outstandingMinor: 1_500 }),
    });
    const rent = selectedBill("rent-1");
    const events: string[] = [];
    const billsApi = {
      getBill: vi.fn(async (id: string) => {
        events.push(`read:${id}`);
        const selected = id === deposit.id ? deposit : rent;
        return detail({
          ...selected,
          financial: balance({
            outstandingMinor: id === deposit.id ? 1_500 : 1_000,
            version: id === deposit.id ? "contract-version-2" : "contract-version-3",
          }),
        });
      }),
    } satisfies Pick<RentalBillsApi, "getBill">;
    const api = financeApi();
    api.confirmDepositReceipt.mockImplementation(async (request) => {
      events.push("deposit");
      expect(request).not.toHaveProperty("amountMinor");
      return entry({
        target: { kind: "bill", billId: request.billId },
        purpose: "deposit_receipt",
      });
    });
    api.recordReceipt.mockImplementation(async (request) => {
      events.push("receipt");
      return entry({ target: request.target, amountMinor: request.amountMinor });
    });

    const attempt = createRentalBillCashBatchAttempt({
      bills: [deposit, rent],
      occurredOn: "2026-10-01",
      note: "  已核对  ",
      amounts: { [rent.id]: 400 },
      billsApi,
      financeApi: api,
    });

    const results = await attempt.submit();

    expect(results.map(({ state }) => state)).toEqual(["success", "success"]);
    expect(events).toEqual(["read:deposit-1", "deposit", "read:rent-1", "receipt"]);
    expect(api.confirmDepositReceipt).toHaveBeenCalledWith({
      billId: "deposit-1",
      occurredOn: "2026-10-01",
      note: "已核对",
      expectedVersion: "contract-version-2",
      idempotencyKey: expect.any(String),
    });
    expect(api.recordReceipt).toHaveBeenCalledWith({
      target: { kind: "bill", billId: "rent-1" },
      amountMinor: 400,
      occurredOn: "2026-10-01",
      note: "已核对",
      expectedVersion: "contract-version-3",
      idempotencyKey: expect.any(String),
    });
  });

  it("成功项在后续提交中不再读取或重复登记", async () => {
    const selected = selectedBill("bill-1");
    const getBill = vi.fn().mockResolvedValue(detail(selected));
    const api = financeApi();
    const attempt = createRentalBillCashBatchAttempt({
      bills: [selected],
      occurredOn: "2026-10-03",
      amounts: { "bill-1": 500 },
      billsApi: { getBill },
      financeApi: api,
    });

    await attempt.submit();
    const [result] = await attempt.submit();

    expect(result?.state).toBe("success");
    expect(getBill).toHaveBeenCalledTimes(1);
    expect(api.recordReceipt).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "网络响应丢失", cause: new ApiError(0, "network", "网络异常") },
    { label: "HTTP 408", cause: new ApiError(408, "timeout", "请求超时") },
    { label: "服务器 5xx", cause: new ApiError(503, "unavailable", "服务暂不可用") },
  ])("$label 时重试原请求，并与创建时的表单快照隔离", async ({ cause }) => {
    const selected = selectedBill("bill-1");
    const getBill = vi
      .fn()
      .mockResolvedValue(
        detail({ ...selected, financial: balance({ version: "latest-version" }) }),
      );
    const api = financeApi();
    api.recordReceipt.mockRejectedValueOnce(cause);
    const input = {
      bills: [selected],
      occurredOn: "2026-10-04",
      note: "原备注",
      amounts: { "bill-1": 450 },
      billsApi: { getBill },
      financeApi: api,
    };
    const attempt = createRentalBillCashBatchAttempt(input);
    selected.amountMinor = 9_999;
    input.amounts["bill-1"] = 999;
    input.note = "表单已变化";

    const [first] = await attempt.submit();
    const [second] = await attempt.submit();

    expect(first?.state).toBe("failed");
    expect(first?.message).toContain("结果暂未确认");
    expect(second?.state).toBe("success");
    expect(api.recordReceipt).toHaveBeenCalledTimes(2);
    expect(api.recordReceipt.mock.calls[0]?.[0]).toMatchObject({
      amountMinor: 450,
      note: "原备注",
      expectedVersion: "latest-version",
    });
    expect(api.recordReceipt.mock.calls[1]?.[0]).toEqual(api.recordReceipt.mock.calls[0]?.[0]);
    expect(getBill).toHaveBeenCalledTimes(1);
  });

  it("明确 409 会丢弃旧请求，重读余额并以新版本和新幂等键重试", async () => {
    const selected = selectedBill("bill-1");
    const getBill = vi
      .fn()
      .mockResolvedValueOnce(detail({ ...selected, financial: balance({ version: "v1" }) }))
      .mockResolvedValueOnce(detail({ ...selected, financial: balance({ version: "v2" }) }));
    const api = financeApi();
    api.recordReceipt.mockRejectedValueOnce(new ApiError(409, "conflict", "版本冲突"));
    const attempt = createRentalBillCashBatchAttempt({
      bills: [selected],
      occurredOn: "2026-10-05",
      amounts: { "bill-1": 500 },
      billsApi: { getBill },
      financeApi: api,
    });

    expect((await attempt.submit())[0]).toMatchObject({ state: "failed" });
    expect((await attempt.submit())[0]).toMatchObject({ state: "success" });

    expect(getBill).toHaveBeenCalledTimes(2);
    expect(api.recordReceipt.mock.calls[0]?.[0].expectedVersion).toBe("v1");
    expect(api.recordReceipt.mock.calls[1]?.[0].expectedVersion).toBe("v2");
    expect(api.recordReceipt.mock.calls[1]?.[0].idempotencyKey).not.toBe(
      api.recordReceipt.mock.calls[0]?.[0].idempotencyKey,
    );
  });

  it("明确 403 作为该账单失败返回，并继续处理后续账单", async () => {
    const first = selectedBill("bill-1");
    const second = selectedBill("bill-2");
    const api = financeApi();
    api.recordReceipt.mockRejectedValueOnce(new ApiError(403, "forbidden", "无权操作"));
    const attempt = createRentalBillCashBatchAttempt({
      bills: [first, second],
      occurredOn: "2026-10-06",
      amounts: { "bill-1": 500, "bill-2": 600 },
      billsApi: { getBill: vi.fn(async (id) => detail(id === first.id ? first : second)) },
      financeApi: api,
    });

    const results = await attempt.submit();

    expect(results.map(({ state }) => state)).toEqual(["failed", "success"]);
    expect(results[0]?.message).toContain("权限");
    expect(api.recordReceipt).toHaveBeenCalledTimes(2);
  });

  it("详情读取失败只标记该账单，其他账单仍可登记", async () => {
    const first = selectedBill("bill-1");
    const second = selectedBill("bill-2");
    const getBill = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, "unavailable", "服务暂不可用"))
      .mockResolvedValueOnce(detail(second));
    const api = financeApi();
    const attempt = createRentalBillCashBatchAttempt({
      bills: [first, second],
      occurredOn: "2026-10-07",
      amounts: { "bill-1": 500, "bill-2": 600 },
      billsApi: { getBill },
      financeApi: api,
    });

    const results = await attempt.submit();

    expect(results.map(({ state }) => state)).toEqual(["failed", "success"]);
    expect(api.recordReceipt).toHaveBeenCalledTimes(1);
    expect(api.recordReceipt.mock.calls[0]?.[0].target).toEqual({ kind: "bill", billId: "bill-2" });
  });

  it.each([
    { label: "账单 ID", latest: { id: "different-bill" } },
    { label: "合同", latest: { contractId: "different-contract" } },
    { label: "账单类型", latest: { type: "deposit" as const } },
    { label: "账单状态", latest: { status: "voided" as const } },
    { label: "币种", latest: { currencyCode: "USD" } },
    { label: "应收金额", latest: { amountMinor: 1_001 } },
    { label: "账单模型版本", latest: { modelVersion: 1 as const } },
    { label: "已关联结算", latest: { settlementId: "settlement-1" } },
  ])("$label 与选择快照不一致时不登记", async ({ latest }) => {
    const selected = selectedBill("bill-1");
    const api = financeApi();
    const attempt = createRentalBillCashBatchAttempt({
      bills: [selected],
      occurredOn: "2026-10-08",
      amounts: { "bill-1": 500 },
      billsApi: {
        getBill: vi.fn().mockResolvedValue(detail(selectedBill("bill-1", latest))),
      },
      financeApi: api,
    });

    const [result] = await attempt.submit();

    expect(result?.state).toBe("failed");
    expect(result?.message).toContain("重新选择");
    expect(api.recordReceipt).not.toHaveBeenCalled();
    expect(api.confirmDepositReceipt).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "待收余额改变",
      selected: { financial: balance({ outstandingMinor: 1_000 }) },
      latest: { financial: balance({ outstandingMinor: 900 }) },
      amounts: { "bill-1": 500 },
    },
    {
      label: "账单已进入结算",
      selected: { financial: balance() },
      latest: { financial: balance(), settlementId: "settlement-1" },
      amounts: { "bill-1": 500 },
    },
  ])("$label 时不发送资金请求，提示重新选择", async ({ selected, latest, amounts }) => {
    const snapshot = selectedBill("bill-1", selected);
    const api = financeApi();
    const attempt = createRentalBillCashBatchAttempt({
      bills: [snapshot],
      occurredOn: "2026-10-08",
      amounts,
      billsApi: {
        getBill: vi.fn().mockResolvedValue(detail(selectedBill("bill-1", latest))),
      },
      financeApi: api,
    });

    const [result] = await attempt.submit();

    expect(result?.state).toBe("failed");
    expect(result?.message).toContain("重新选择");
    expect(api.recordReceipt).not.toHaveBeenCalled();
    expect(api.confirmDepositReceipt).not.toHaveBeenCalled();
  });

  it("选择账单在详情读取返回前取消时不登记，也不读取下一笔", async () => {
    const first = selectedBill("bill-1");
    const second = selectedBill("bill-2");
    let resolveRead!: (value: RentalBillDetail) => void;
    const getBill = vi.fn(
      () =>
        new Promise<RentalBillDetail>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const api = financeApi();
    const attempt = createRentalBillCashBatchAttempt({
      bills: [first, second],
      occurredOn: "2026-10-09",
      amounts: { "bill-1": 500, "bill-2": 500 },
      billsApi: { getBill },
      financeApi: api,
    });
    let active = true;
    const pending = attempt.submit(() => active);
    active = false;
    resolveRead(detail(first));

    const results = await pending;

    expect(results.map(({ state }) => state)).toEqual(["pending", "pending"]);
    expect(getBill).toHaveBeenCalledTimes(1);
    expect(api.recordReceipt).not.toHaveBeenCalled();
  });

  it("当前资金请求完成后若已取消，保留其结果并停止后续账单", async () => {
    const first = selectedBill("bill-1");
    const second = selectedBill("bill-2");
    const getBill = vi.fn(async (id: string) => detail(id === first.id ? first : second));
    const api = financeApi();
    let resolveReceipt!: (value: RentalCashEntry) => void;
    api.recordReceipt.mockImplementationOnce(
      () =>
        new Promise<RentalCashEntry>((resolve) => {
          resolveReceipt = resolve;
        }),
    );
    const attempt = createRentalBillCashBatchAttempt({
      bills: [first, second],
      occurredOn: "2026-10-10",
      amounts: { "bill-1": 500, "bill-2": 500 },
      billsApi: { getBill },
      financeApi: api,
    });
    let active = true;
    const pending = attempt.submit(() => active);
    await vi.waitFor(() => expect(api.recordReceipt).toHaveBeenCalledTimes(1));
    active = false;
    resolveReceipt(entry());

    const results = await pending;

    expect(results.map(({ state }) => state)).toEqual(["success", "pending"]);
    expect(getBill).toHaveBeenCalledTimes(1);
    expect(api.recordReceipt).toHaveBeenCalledTimes(1);
  });
});
