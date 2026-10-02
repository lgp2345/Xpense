import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { rentalBillsKeys } from "./rental-bills-query";
import { invalidateRentalFinance, rentalFinanceKeys } from "./rental-finance-query";

describe("租赁财务查询缓存", () => {
  it("键按组织、资源、资源标识和筛选隔离", () => {
    const charge = rentalFinanceKeys.chargeTerms("org-a", "contract-a");
    expect(charge).toEqual(["rental", "org-a", "finance", "charges", "contract-a", {}]);
    expect(rentalFinanceKeys.chargeTerms("org-b", "contract-a")).not.toEqual(charge);
    expect(rentalFinanceKeys.billCash("org-a", "contract-a", "bill-a", { page: 2 })).not.toEqual(
      rentalFinanceKeys.billCash("org-a", "contract-a", "bill-a", { page: 1 }),
    );
  });

  it("失效本合同财务数据、全合同账单列表和实际属于本合同的详情", async () => {
    const queryClient = new QueryClient();
    const keys = [
      rentalFinanceKeys.chargeTerms("org-a", "contract-a"),
      rentalFinanceKeys.meterBaseline("org-a", "contract-a"),
      rentalFinanceKeys.contractBills("org-a", "contract-a", { page: 2 }),
      rentalFinanceKeys.billCash("org-a", "contract-a", "bill-a", { page: 1 }),
      rentalFinanceKeys.settlement("org-a", "contract-a"),
      rentalFinanceKeys.settlementCash("org-a", "contract-a", "settlement-a", { page: 2 }),
      rentalBillsKeys.list("org-a", { page: 1 }),
      rentalBillsKeys.list("org-a", { page: 2 }),
      rentalBillsKeys.list("org-a", { contractId: "contract-a", page: 1 }),
      rentalBillsKeys.detail("org-a", "bill-a"),
    ];
    for (const key of keys) {
      queryClient.setQueryData(key, {
        items: [{ id: "other-bill", contractId: "contract-b" }],
        total: 1,
        page: 1,
        pageSize: 20,
        totals: { monthlyAmountMinor: 15000 },
      });
    }
    queryClient.setQueryData(rentalBillsKeys.detail("org-a", "bill-a"), {
      contractId: "contract-a",
    });

    await invalidateRentalFinance(queryClient, "org-a", "contract-a");

    for (const key of keys) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    queryClient.clear();
  });

  it("保留其他组织、其他合同限定账单及其他合同详情", async () => {
    const queryClient = new QueryClient();
    const retainedKeys = [
      rentalFinanceKeys.chargeTerms("org-b", "contract-a"),
      rentalFinanceKeys.chargeTerms("org-a", "contract-b"),
      rentalFinanceKeys.contractBills("org-a", "contract-b", {}),
      rentalBillsKeys.list("org-b", {}),
      rentalBillsKeys.list("org-a", { contractId: "contract-b" }),
      rentalBillsKeys.detail("org-a", "bill-b"),
    ];
    for (const key of retainedKeys) queryClient.setQueryData(key, { contractId: "contract-b" });

    await invalidateRentalFinance(queryClient, "org-a", "contract-a");

    for (const key of retainedKeys)
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    queryClient.clear();
  });

  it("结算流水按组织、合同和结算目标隔离", () => {
    expect(
      rentalFinanceKeys.settlementCash("org-a", "contract-a", "settlement-a", { page: 2 }),
    ).toEqual([
      "rental",
      "org-a",
      "finance",
      "cash",
      "contract-a",
      { page: 2, settlementId: "settlement-a" },
    ]);
    expect(rentalFinanceKeys.settlementCash("org-b", "contract-a", "settlement-a")).not.toEqual(
      rentalFinanceKeys.settlementCash("org-a", "contract-a", "settlement-a"),
    );
    expect(rentalFinanceKeys.settlementCash("org-a", "contract-b", "settlement-a")).not.toEqual(
      rentalFinanceKeys.settlementCash("org-a", "contract-a", "settlement-a"),
    );
    expect(rentalFinanceKeys.settlementCash("org-a", "contract-a", "settlement-b")).not.toEqual(
      rentalFinanceKeys.settlementCash("org-a", "contract-a", "settlement-a"),
    );
  });
});
