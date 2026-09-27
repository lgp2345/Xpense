import type { BillingTerms } from "./billing.types.js";
import { buildRentPlan, prorateBillingAmount, sumBillingAmounts } from "./billing-period.rules.js";
import { calendarDateToDayNumber, parseCalendarDate } from "./contract-date.rules.js";

/** 从原计划定位付款账期，逐月折算截至最后计租日的参考应收。 */
export function calculateTerminationReference(terms: BillingTerms, terminationDate: string) {
  const terminationDay = calendarDateToDayNumber(parseCalendarDate(terminationDate));
  const draft = buildRentPlan(terms).drafts.find(
    (item) => item.periodStart <= terminationDate && item.periodEnd >= terminationDate,
  );
  if (!draft) throw new RangeError("终止日期不在合同租期内");
  const amounts = draft.lines.map((line) => {
    if (line.periodStart > terminationDate) return 0;
    if (line.periodEnd <= terminationDate) return line.amountMinor;
    const startDay = calendarDateToDayNumber(parseCalendarDate(line.periodStart));
    return prorateBillingAmount(
      line.baseRentAmountMinor,
      terminationDay - startDay + 1,
      line.referenceDays,
    );
  });
  return {
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    originalAmountMinor: draft.amountMinor,
    referenceAmountMinor: sumBillingAmounts(amounts),
    lines: draft.lines,
  };
}
