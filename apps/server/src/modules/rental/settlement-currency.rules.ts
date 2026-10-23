import type { RentalFinanceSnapshot } from "./rental-finance.types.js";

/** 结算费用没有独立币种事实，不能把历史账单现金换算成当前组织币种。 */
export function assertSettlementCurrency(
  source: Pick<RentalFinanceSnapshot, "bills" | "context">,
): void {
  if (source.bills.some((bill) => bill.currencyCode !== source.context.currencyCode))
    throw new RangeError("合同账单币种与当前费用币种不一致，请先确认历史币种政策后再结算");
}
