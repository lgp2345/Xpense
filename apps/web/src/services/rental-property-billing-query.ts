import type { RentalPropertyBillingPage } from "@xpense/shared";
import type { ApiRequestOptions } from "./api-client";
import type { RentalFinanceApi } from "./rental-finance-api";
export const propertyBillingKey = (organizationId: string, propertyId: string) =>
  ["rental", organizationId, "property-billing", propertyId] as const;
/** 一次查询只发布完整树；午夜跨页时重启批次，取消或中间页失败不发布部分结果。 */
export async function loadPropertyBillingCandidates(
  api: Pick<RentalFinanceApi, "listPropertyBilling">,
  propertyId: string,
  options?: ApiRequestOptions,
): Promise<RentalPropertyBillingPage> {
  for (let restart = 0; restart < 3; restart++) {
    let first: RentalPropertyBillingPage | null = null;
    let afterContractId: string | undefined;
    const items: RentalPropertyBillingPage["items"] = [];
    const unpaidBills: RentalPropertyBillingPage["unpaidBills"] = [];
    const seen = new Set<string>();
    while (true) {
      options?.signal?.throwIfAborted();
      const page = await api.listPropertyBilling(
        { propertyId, afterContractId, pageSize: 100 },
        options,
      );
      options?.signal?.throwIfAborted();
      if (first && (page.today !== first.today || page.timezone !== first.timezone)) break;
      first ??= page;
      items.push(...page.items);
      unpaidBills.push(...page.unpaidBills);
      if (!page.nextAfterContractId)
        return { ...first, items, unpaidBills, nextAfterContractId: null };
      if (seen.has(page.nextAfterContractId)) throw new Error("候选分页游标未推进，请重试。");
      seen.add(page.nextAfterContractId);
      afterContractId = page.nextAfterContractId;
    }
  }
  throw new Error("组织日期已变化，请重新读取待出账列表。");
}
