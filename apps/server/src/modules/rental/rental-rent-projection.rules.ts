import type { BillingRentLine, BillingTerms } from "./billing.types.js";
import { buildRentPlan, prorateBillingAmount, sumBillingAmounts } from "./billing-period.rules.js";
import { calculateTerminationReference } from "./billing-termination.rules.js";
import { calendarDateToDayNumber, parseCalendarDate } from "./contract-date.rules.js";

export type RentalRentProjection = { billingMonth: string; lines: BillingRentLine[] };

export function projectRentalRentThroughDate(
  terms: BillingTerms,
  effectiveEndDate: string,
): RentalRentProjection[] {
  parseCalendarDate(effectiveEndDate);
  if (effectiveEndDate < terms.startDate || effectiveEndDate > terms.endDate) {
    throw new RangeError("租金投影结束日必须位于合同租期内");
  }

  const byMonth = new Map<string, BillingRentLine[]>();
  for (const draft of buildRentPlan(terms).drafts) {
    if (draft.periodStart > effectiveEndDate) continue;
    const original = draft.lines;
    const lines =
      draft.periodEnd <= effectiveEndDate
        ? original
        : original.flatMap((item) => {
            if (item.periodStart > effectiveEndDate) return [];
            if (item.periodEnd <= effectiveEndDate) return [item];
            const coveredDays =
              calendarDateToDayNumber(parseCalendarDate(effectiveEndDate)) -
              calendarDateToDayNumber(parseCalendarDate(item.periodStart)) +
              1;
            return [
              {
                ...item,
                periodEnd: effectiveEndDate,
                coveredDays,
                amountMinor: prorateBillingAmount(
                  item.baseRentAmountMinor,
                  coveredDays,
                  item.referenceDays,
                ),
              },
            ];
          });

    if (draft.periodEnd > effectiveEndDate) {
      const reference = calculateTerminationReference(terms, effectiveEndDate);
      if (
        reference.periodStart !== draft.periodStart ||
        sumBillingAmounts(lines.map((item) => item.amountMinor)) !== reference.referenceAmountMinor
      ) {
        throw new RangeError("终止租金片段与原付款账期不一致");
      }
    }

    const billingMonth = draft.periodStart.slice(0, 7);
    byMonth.set(billingMonth, [...(byMonth.get(billingMonth) ?? []), ...lines]);
  }
  return [...byMonth].map(([billingMonth, lines]) => ({ billingMonth, lines }));
}
