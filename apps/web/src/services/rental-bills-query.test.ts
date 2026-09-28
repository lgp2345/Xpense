import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { RentalBillsApi } from "./rental-bills-api";
import {
  invalidateRentalBills,
  rentalBillsKeys,
  rentalBillsQueryOptions,
} from "./rental-bills-query";
import { clearRentalQueries, invalidateContractMutation } from "./rental-query";

describe("账单组织缓存", () => {
  it("键含组织、合同、筛选与分页，读取去重，不缓存预览", async () => {
    const client = new QueryClient();
    const api = { listBills: vi.fn().mockResolvedValue({}) } as unknown as RentalBillsApi;
    const a = rentalBillsQueryOptions.list(api, "a", { contractId: "c" });
    const b = rentalBillsKeys.list("b", { contractId: "c" });
    expect(a.queryKey).not.toEqual(b);
    expect(rentalBillsKeys.list("a", { contractId: "c", page: 2 })).not.toEqual(a.queryKey);
    await Promise.all([client.fetchQuery(a), client.fetchQuery(a)]);
    expect(api.listBills).toHaveBeenCalledOnce();
    expect(a.queryKey.slice(0, 3)).toEqual(["rental", "a", "bills"]);
    client.clear();
  });
  it("合同动作和生成只失效发起组织，清理会话覆盖所有账单", async () => {
    const client = new QueryClient();
    const a = rentalBillsKeys.list("a", {});
    const detail = rentalBillsKeys.detail("a", "bill");
    const b = rentalBillsKeys.list("b", {});
    for (const key of [a, detail, b]) client.setQueryData(key, {});
    await invalidateContractMutation(client, "a", "contract");
    expect(client.getQueryState(a)?.isInvalidated).toBe(true);
    expect(client.getQueryState(detail)?.isInvalidated).toBe(true);
    expect(client.getQueryState(b)?.isInvalidated).toBe(false);
    await invalidateRentalBills(client, "a");
    clearRentalQueries(client, "a");
    expect(client.getQueryData(a)).toBeUndefined();
    expect(client.getQueryData(b)).toBeDefined();
    client.clear();
  });
});
