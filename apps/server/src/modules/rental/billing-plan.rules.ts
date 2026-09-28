import type {
  RentalBillCoverage,
  RentalBillGenerationInput,
  RentalBillPreviewItem,
  RentalBillTotals,
} from "@xpense/shared";
import type { BillingDraft, BillingSource } from "./billing.types.js";
import { buildRentPlan, sumBillingAmounts } from "./billing-period.rules.js";
import { billingDigest, billingTerms, buildDepositDrafts } from "./billing-source.rules.js";
import { applicableBillingDrafts } from "./billing-termination-plan.rules.js";

/** 全计划分类汇总，金额超限明确拒绝。 */
export function billingTotals(
  drafts: Array<Pick<BillingDraft, "type" | "amountMinor">>,
): RentalBillTotals {
  return {
    rentAmountMinor: sumBillingAmounts(
      drafts.filter((draft) => draft.type === "rent").map((draft) => draft.amountMinor),
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

export function normalBillingDrafts(
  source: BillingSource,
  dueDates: Record<string, string>,
): BillingDraft[] {
  return [
    ...buildRentPlan(billingTerms(source)).drafts,
    ...buildDepositDrafts(source.contract.depositTerms, dueDates),
  ];
}

/** 缺少日期的预览只读；既有押金的到期日保持原值。 */
export function assembleBillingPreview(source: BillingSource, input: RentalBillGenerationInput) {
  const applicable = applicableBillingDrafts(
    source,
    normalBillingDrafts(source, input.depositDueDates),
    input.terminationConfirmation,
  );
  const drafts = applicable.drafts;
  const active = new Map(source.activeBills.map((bill) => [bill.sourceKey, bill]));
  const applicableKeys = new Set(drafts.map((draft) => draft.sourceKey));
  if (source.activeBills.some((bill) => !applicableKeys.has(bill.sourceKey)))
    throw new RangeError("有效账单与当前适用计划不一致");
  const missingDepositSourceKeys: string[] = [];
  const items: RentalBillPreviewItem[] = [];
  const creates: BillingDraft[] = [];
  for (const draft of drafts) {
    const bill = active.get(draft.sourceKey);
    if (bill && !billingDraftMatches(draft, bill))
      throw new RangeError("有效账单与当前计费计划不一致");
    if (!bill) {
      creates.push(draft);
      if (draft.type === "deposit" && !draft.dueDate)
        missingDepositSourceKeys.push(draft.sourceKey);
    }
    items.push({
      type: draft.type,
      sourceKey: draft.sourceKey,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      effectiveEnd: draft.effectiveEnd,
      dueDate: bill?.dueDate ?? draft.dueDate,
      amountMinor: bill?.amountMinor ?? draft.amountMinor,
      lines: bill?.lines ?? draft.lines,
      disposition: bill ? "existing" : "create",
      existingBillId: bill?.id ?? null,
    });
  }
  return {
    ...applicable,
    creates,
    items,
    missingDepositSourceKeys,
    totals: billingTotals(items),
    createTotals: billingTotals(creates),
  };
}

/** 只读用户按完整适用计划查看覆盖，不受分页与状态筛选影响。 */
export function billingCoverage(source: BillingSource): RentalBillCoverage {
  const active = new Set(source.activeBills.map((bill) => bill.sourceKey));
  const drafts =
    source.contract.lifecycleStatus === "draft" || source.contract.lifecycleStatus === "cancelled"
      ? []
      : applicableBillingDrafts(source, normalBillingDrafts(source, {})).drafts;
  return {
    existingRentCount: drafts.filter(
      (draft) => draft.type === "rent" && active.has(draft.sourceKey),
    ).length,
    existingDepositCount: drafts.filter(
      (draft) => draft.type === "deposit" && active.has(draft.sourceKey),
    ).length,
    missingRentCount: drafts.filter(
      (draft) => draft.type === "rent" && !active.has(draft.sourceKey),
    ).length,
    missingDepositCount: drafts.filter(
      (draft) => draft.type === "deposit" && !active.has(draft.sourceKey),
    ).length,
  };
}
