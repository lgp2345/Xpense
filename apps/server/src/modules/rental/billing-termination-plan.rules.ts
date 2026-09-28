import type { RentalBillTerminationConfirmation } from "@xpense/shared";
import type { BillingDraft, BillingSource } from "./billing.types.js";
import { billingTerms } from "./billing-source.rules.js";
import { calculateTerminationReference } from "./billing-termination.rules.js";

/** 原付款期完整计算行加独立差额，最终整期应收可以为零。 */
export function terminationDraft(
  draft: BillingDraft,
  terminationDate: string,
  finalAmountMinor: number,
): BillingDraft {
  return {
    ...draft,
    effectiveEnd: terminationDate,
    amountMinor: finalAmountMinor,
    lines: [
      ...draft.lines,
      {
        kind: "termination_adjustment",
        label: "终止当期应收调整",
        amountMinor: finalAmountMinor - draft.amountMinor,
        periodStart: null,
        periodEnd: null,
        referenceStart: null,
        referenceEnd: null,
        coveredDays: null,
        referenceDays: null,
        baseRentAmountMinor: null,
        sortOrder: draft.lines.length,
      },
    ],
  };
}

/** 确认事件必须属于当前终止，不能按同日复用撤销前的事件。 */
export function assertCurrentAdjustment(source: BillingSource) {
  const adjustment = source.adjustment;
  if (
    adjustment &&
    (adjustment.terminationDate !== source.contract.terminationDate ||
      adjustment.terminationRecordedAt !== source.terminationRecordedAt ||
      adjustment.revokedAt !== null)
  )
    throw new RangeError("终止确认与当前合同事件不一致");
}

export function applicableBillingDrafts(
  source: BillingSource,
  drafts: BillingDraft[],
  confirmation?: RentalBillTerminationConfirmation,
) {
  if (source.contract.lifecycleStatus !== "terminated") {
    if (confirmation) throw new RangeError("未终止合同不接受终止金额确认");
    return { drafts, terminationReference: null, requiresTerminationConfirmation: false };
  }
  const date = source.contract.terminationDate;
  if (!date) throw new RangeError("已终止合同缺少终止日期");
  assertCurrentAdjustment(source);
  const reference = calculateTerminationReference(billingTerms(source), date);
  const adjustment = source.adjustment;
  if (
    adjustment &&
    confirmation &&
    (adjustment.finalAmountMinor !== confirmation.finalAmountMinor ||
      adjustment.reason !== confirmation.reason)
  )
    throw new RangeError("终止应收已确认，不能在补生成时改写");
  const finalAmount = adjustment?.finalAmountMinor ?? confirmation?.finalAmountMinor;
  return {
    drafts: drafts
      .filter((draft) => draft.type === "deposit" || (draft.periodStart as string) <= date)
      .map((draft) =>
        draft.type === "rent" &&
        draft.periodStart === reference.periodStart &&
        finalAmount !== undefined
          ? terminationDraft(draft, date, finalAmount)
          : draft,
      ),
    terminationReference: {
      periodStart: reference.periodStart,
      periodEnd: reference.periodEnd,
      originalAmountMinor: reference.originalAmountMinor,
      referenceAmountMinor: reference.referenceAmountMinor,
    },
    requiresTerminationConfirmation: finalAmount === undefined,
  };
}
