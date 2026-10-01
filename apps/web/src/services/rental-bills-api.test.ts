import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createRentalBillGenerationAttempt, createRentalBillsApi } from "./rental-bills-api";

describe("账单请求边界", () => {
  it("安全编码筛选与 ID，五个路径正确，生成不夹带预览分页", async () => {
    const client = { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}) };
    const api = createRentalBillsApi(client as unknown as ApiClient);
    await api.listBills({
      keyword: "租金 / A",
      status: "voided",
      type: "rent",
      page: 2,
      pageSize: 20,
      dueDateFrom: "2026-01-01",
    });
    await api.getBill("bill/1");
    expect(client.get).toHaveBeenNthCalledWith(
      1,
      "/rental-bills/list?keyword=%E7%A7%9F%E9%87%91+%2F+A&type=rent&status=voided&dueDateFrom=2026-01-01&page=2&pageSize=20",
    );
    expect(client.get).toHaveBeenNthCalledWith(2, "/rental-bills/detail?id=bill%2F1");
    const input = {
      contractId: "contract",
      depositDueDates: {},
      expectedVersion: "version",
      idempotencyKey: "key",
      page: 2,
      pageSize: 100,
    };
    await api.previewBills(input);
    await api.generateBills(input);
    await api.previewTermination({ contractId: "contract", terminationDate: "2026-06-30" });
    expect(client.post.mock.calls[1]).toEqual([
      "/rental-bills/generate",
      {
        contractId: "contract",
        depositDueDates: {},
        expectedVersion: "version",
        idempotencyKey: "key",
      },
    ]);
    expect(client.post.mock.calls[2]?.[0]).toBe("/rental-bills/termination-preview");
    client.post.mockRejectedValueOnce(new Error("请求失败"));
    await expect(api.previewBills(input)).rejects.toThrow("请求失败");
  });
  it("响应丢失后保留原请求和幂等键，新确认使用新键", async () => {
    let committedKey: string | undefined;
    const generateBills = vi.fn(async (input: { idempotencyKey: string }) => {
      if (!committedKey) {
        committedKey = input.idempotencyKey;
        throw new Error("response lost");
      }
      return { generationId: "batch", replayed: input.idempotencyKey === committedKey };
    });
    const api = { generateBills } as unknown as ReturnType<typeof createRentalBillsApi>;
    const input = {
      contractId: "contract",
      depositDueDates: { deposit: "2026-01-01" },
      expectedVersion: "version",
    };
    const attempt = createRentalBillGenerationAttempt(api, input);
    await expect(attempt.submit()).rejects.toThrow("response lost");
    input.depositDueDates.deposit = "2026-02-01";
    expect(await attempt.submit()).toMatchObject({ generationId: "batch", replayed: true });
    expect(generateBills.mock.calls[0]?.[0]).toEqual(generateBills.mock.calls[1]?.[0]);
    expect(attempt.request.depositDueDates.deposit).toBe("2026-01-01");
    expect(createRentalBillGenerationAttempt(api, input).request.idempotencyKey).not.toBe(
      attempt.request.idempotencyKey,
    );
  });

  it("新版独立押金预览和生成保留 deposits scope", async () => {
    const client = { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}) };
    const api = createRentalBillsApi(client as unknown as ApiClient);
    await api.previewBills({ contractId: "contract", scope: "deposits", depositDueDates: {} });
    await api.generateBills({
      contractId: "contract",
      scope: "deposits",
      depositDueDates: { deposit: "2026-08-31" },
      expectedVersion: "deposit-v1",
      idempotencyKey: "deposit-key",
    });

    expect(client.post).toHaveBeenNthCalledWith(1, "/rental-bills/preview", {
      contractId: "contract",
      scope: "deposits",
      depositDueDates: {},
    });
    expect(client.post).toHaveBeenNthCalledWith(2, "/rental-bills/generate", {
      contractId: "contract",
      scope: "deposits",
      depositDueDates: { deposit: "2026-08-31" },
      expectedVersion: "deposit-v1",
      idempotencyKey: "deposit-key",
    });
  });

  it("按服务端修订端点读取账单历史并安全编码分页目标", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      post: vi.fn(),
    };
    const api = createRentalBillsApi(client as unknown as ApiClient);

    await api.listRevisions({ billId: "bill/1", page: 2, pageSize: 50 });

    expect(client.get).toHaveBeenCalledWith(
      "/rental-bills/revisions?billId=bill%2F1&page=2&pageSize=50",
    );
  });
});
