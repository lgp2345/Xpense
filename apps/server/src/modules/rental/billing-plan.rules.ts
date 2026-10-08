import type { RentalBillTotals } from "@xpense/shared";
import type { BillingDraft, BillingSource } from "./billing.types.js";
import { sumBillingAmounts } from "./billing-period.rules.js";
import { billingDigest } from "./billing-source.rules.js";

/** 全计划分类汇总，金额超限明确拒绝。 */
export function billingTotals(
  drafts: Array<Pick<BillingDraft, "type" | "amountMinor">>,
): RentalBillTotals {
  return {
    rentAmountMinor: sumBillingAmounts(
      drafts.filter((draft) => draft.type === "period").map((draft) => draft.amountMinor),
    ),
    depositAmountMinor: sumBillingAmounts(
      drafts.filter((draft) => draft.type === "deposit").map((draft) => draft.amountMinor),
    ),
  };
}

/** 比较计费依据，不将履行中保留的承租方快照误判为失效。 */
export function billingDraftMatches(
  draft: BillingDraft,
  bill: BillingSource["activeBills"][number],
): boolean {
  return (
    draft.amountMinor === bill.amountMinor &&
    draft.periodStart === bill.periodStart &&
    draft.periodEnd === bill.periodEnd &&
    draft.effectiveEnd === bill.effectiveEnd &&
    (draft.type === "deposit" || draft.dueDate === bill.dueDate) &&
    billingDigest(draft.lines) === billingDigest(bill.lines)
  );
}
