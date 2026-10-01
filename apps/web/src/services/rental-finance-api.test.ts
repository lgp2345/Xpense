import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createRentalFinanceApi, createRentalFinanceAttempt } from "./rental-finance-api";

describe("租赁财务 API 边界", () => {
  it("将收费、读数、月度账单和修订映射到服务端动作", async () => {
    const client = { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}) };
    const api = createRentalFinanceApi(client as unknown as ApiClient);
    const contractId = "contract/1";
    const preview = {
      contractId,
      billingMonth: "2026-08",
      extraFees: [],
    };
    const update = {
      contractId,
      expectedVersion: "v1",
      idempotencyKey: "request-1",
      reason: "交接",
      waterUnitPrice: "3.0000",
      electricityUnitPrice: "4.0000",
      fixedFees: [],
    };

    await api.getChargeTerms(contractId);
    await api.updateChargeTerms(update);
    await api.getMeterBaseline(contractId);
    await api.previewMonthlyBill(preview);
    await api.generateMonthlyBill({
      ...preview,
      dueDate: "2026-08-10",
      readings: [
        { kind: "water", readingDate: "2026-08-31", reading: "10" },
        { kind: "electricity", readingDate: "2026-08-31", reading: "20" },
      ],
      expectedVersion: "preview-v1",
      idempotencyKey: "request-2",
    });
    await api.previewBillRevision({ billId: "bill-1", expectedVersion: "cash-v1", reason: "更正" });
    await api.adjustBill({
      billId: "bill-1",
      expectedVersion: "cash-v1",
      idempotencyKey: "request-3",
      reason: "更正",
    });

    expect(client.get.mock.calls.map(([path]) => path)).toEqual([
      "/rental-charges/detail?id=contract%2F1",
      "/rental-meters/detail?id=contract%2F1",
    ]);
    expect(client.post.mock.calls.map(([path]) => path)).toEqual([
      "/rental-charges/update",
      "/rental-monthly-bills/preview",
      "/rental-monthly-bills/generate",
      "/rental-monthly-bills/adjust-preview",
      "/rental-monthly-bills/adjust",
    ]);
    expect(client.post.mock.calls[2]?.[1]).toMatchObject({ expectedVersion: "preview-v1" });
  });

  it("把现金与结算读取和确认绑定到唯一目标及组织来源请求", async () => {
    const client = { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}) };
    const api = createRentalFinanceApi(client as unknown as ApiClient);
    await api.listCash({ target: { kind: "bill", billId: "bill/1" }, page: 2, pageSize: 50 });
    await api.recordReceipt({
      target: { kind: "bill", billId: "bill-1" },
      amountMinor: 100,
      occurredOn: "2026-08-10",
      expectedVersion: "cash-v1",
      idempotencyKey: "request-4",
    });
    await api.confirmDepositReceipt({
      billId: "deposit-1",
      occurredOn: "2026-08-10",
      expectedVersion: "cash-v1",
      idempotencyKey: "request-5",
    });
    await api.confirmRefund({
      target: { kind: "bill", billId: "bill-1" },
      occurredOn: "2026-08-10",
      expectedVersion: "cash-v1",
      idempotencyKey: "request-6",
    });
    await api.revokeReceipt({
      entryId: "entry-1",
      reason: "误录",
      expectedVersion: "cash-v1",
      idempotencyKey: "request-7",
    });
    await api.revokeRefund({
      entryId: "entry-2",
      reason: "误录",
      expectedVersion: "cash-v2",
      idempotencyKey: "request-8",
    });
    await api.getSettlement("contract-1");
    await api.previewSettlement({ contractId: "contract-1", extraFees: [] });
    await api.confirmSettlement({
      contractId: "contract-1",
      extraFees: [],
      expectedVersion: "set-v1",
      idempotencyKey: "request-9",
    });
    await api.settlementHistory({ contractId: "contract-1", page: 2, pageSize: 50 });

    expect(client.get.mock.calls.map(([path]) => path)).toEqual([
      "/rental-cash/list?kind=bill&billId=bill%2F1&page=2&pageSize=50",
      "/rental-settlements/detail?contractId=contract-1",
      "/rental-settlements/history?contractId=contract-1&page=2&pageSize=50",
    ]);
    expect(client.post.mock.calls.map(([path]) => path)).toEqual([
      "/rental-receipts/create",
      "/rental-receipts/confirm-deposit",
      "/rental-refunds/create",
      "/rental-receipts/revoke",
      "/rental-refunds/revoke",
      "/rental-settlements/preview",
      "/rental-settlements/confirm",
    ]);
    expect(client.post.mock.calls[2]?.[1]).not.toHaveProperty("amountMinor");
  });

  it("在响应未知时重试相同不可变负金额请求和幂等键", async () => {
    const submit = vi.fn().mockRejectedValueOnce(new Error("response lost")).mockResolvedValue({});
    const input = {
      contractId: "contract-1",
      expectedVersion: "v1",
      idempotencyKey: "request-10",
      extraFees: [{ id: "fee-1", name: "水电调整", amountMinor: -10000, note: "按实冲减" }],
    };
    const attempt = createRentalFinanceAttempt(submit, input);

    await expect(attempt.submit()).rejects.toThrow("response lost");
    const fee = input.extraFees.at(0);
    if (!fee) throw new Error("Test fee is missing");
    fee.amountMinor = 10000;
    await attempt.submit();

    expect(submit).toHaveBeenNthCalledWith(1, {
      contractId: "contract-1",
      expectedVersion: "v1",
      idempotencyKey: "request-10",
      extraFees: [{ id: "fee-1", name: "水电调整", amountMinor: -10000, note: "按实冲减" }],
    });
    expect(submit.mock.calls[0]?.[0]).toEqual(submit.mock.calls[1]?.[0]);
  });
});
