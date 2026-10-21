import { expect, it, vi } from "vitest";
import {
  billingPageFixture,
  candidateFixture,
  unpaidBillFixture,
} from "../features/rental/property-billing/property-billing-test-fixtures";
import { loadPropertyBillingCandidates, propertyBillingKey } from "./rental-property-billing-query";

it("空中间页继续取完，分页共用 signal", async () => {
  const signal = new AbortController().signal;
  const api = {
    listPropertyBilling: vi
      .fn()
      .mockResolvedValueOnce({ ...billingPageFixture, items: [], nextAfterContractId: "100" })
      .mockResolvedValueOnce({ ...billingPageFixture, items: [], nextAfterContractId: "200" })
      .mockResolvedValueOnce(billingPageFixture),
  };
  const data = await loadPropertyBillingCandidates(api, "property", { signal });
  expect(data.items).toEqual([candidateFixture]);
  expect(api.listPropertyBilling).toHaveBeenCalledTimes(3);
  expect(api.listPropertyBilling).toHaveBeenLastCalledWith(
    { propertyId: "property", afterContractId: "200", pageSize: 100 },
    { signal },
  );
  expect(propertyBillingKey("org", "property")).toEqual([
    "rental",
    "org",
    "property-billing",
    "property",
  ]);
});
it("跨午夜丢弃旧批次从首批重读", async () => {
  const api = {
    listPropertyBilling: vi
      .fn()
      .mockResolvedValueOnce({ ...billingPageFixture, nextAfterContractId: "100" })
      .mockResolvedValueOnce({ ...billingPageFixture, today: "2026-10-19" })
      .mockResolvedValueOnce({ ...billingPageFixture, today: "2026-10-19" }),
  };
  expect((await loadPropertyBillingCandidates(api, "property")).today).toBe("2026-10-19");
  expect(api.listPropertyBilling.mock.calls[2]?.[0]).not.toHaveProperty("afterContractId", "100");
});
it("中间页失败不返回部分树", async () => {
  const api = {
    listPropertyBilling: vi
      .fn()
      .mockResolvedValueOnce({ ...billingPageFixture, nextAfterContractId: "100" })
      .mockRejectedValueOnce(new Error("failed")),
  };
  await expect(loadPropertyBillingCandidates(api, "property")).rejects.toThrow("failed");
});
it("取消后不继续下一页", async () => {
  const controller = new AbortController();
  const api = {
    listPropertyBilling: vi.fn().mockImplementation(async () => {
      controller.abort();
      return { ...billingPageFixture, nextAfterContractId: "100" };
    }),
  };
  await expect(
    loadPropertyBillingCandidates(api, "property", { signal: controller.signal }),
  ).rejects.toThrow();
  expect(api.listPropertyBilling).toHaveBeenCalledTimes(1);
});

it("逐页合并未收账单，包括没有待出账候选的页", async () => {
  const deposit = {
    ...unpaidBillFixture,
    bill: { ...unpaidBillFixture.bill, id: "deposit", type: "deposit" as const },
  };
  const api = {
    listPropertyBilling: vi
      .fn()
      .mockResolvedValueOnce({
        ...billingPageFixture,
        items: [],
        unpaidBills: [unpaidBillFixture],
        nextAfterContractId: "100",
      })
      .mockResolvedValueOnce({ ...billingPageFixture, unpaidBills: [deposit] }),
  };
  const result = await loadPropertyBillingCandidates(api, "property");
  expect(result.unpaidBills.map((item) => item.bill.id)).toEqual(["old-bill", "deposit"]);
  expect(result.items).toEqual([candidateFixture]);
});
