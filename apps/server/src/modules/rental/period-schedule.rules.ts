import type { RentalBillingPeriod } from "@xpense/shared";
import { buildRentPlan, prorateBillingAmount, sumBillingAmounts } from "./billing-period.rules.js";
import type { BillingRentDraft, BillingTerms } from "./billing.types.js";
import { calendarDateToDayNumber, parseCalendarDate } from "./contract-date.rules.js";

export type PeriodScheduleInput = {
  terms: BillingTerms;
  effectiveEndDate: string;
  firstPeriodStart: string;
  activePeriods: RentalBillingPeriod[];
};

/** 按合同原始锚点分期，接续仅限定下界，实际结束仅截断末期。 */
export function billingPeriods(
  input: Omit<PeriodScheduleInput, "activePeriods">,
): BillingRentDraft[] {
  const original = buildRentPlan(input.terms).drafts;
  const startIndex = original.findIndex((period) => period.periodStart === input.firstPeriodStart);
  if (startIndex < 0) throw new RangeError("出账起点必须是合同原始账期边界");
  parseCalendarDate(input.effectiveEndDate);
  if (
    input.effectiveEndDate > input.terms.endDate ||
    input.effectiveEndDate < input.terms.startDate
  ) {
    throw new RangeError("实际结束日期不在合同租期内");
  }
  const endDay = calendarDateToDayNumber(parseCalendarDate(input.effectiveEndDate));
  return original
    .slice(startIndex)
    .filter((draft) => draft.periodStart <= input.effectiveEndDate)
    .map((draft) => {
      const periodEnd =
        draft.periodEnd < input.effectiveEndDate ? draft.periodEnd : input.effectiveEndDate;
      const lines = draft.lines
        .filter((line) => line.periodStart <= periodEnd)
        .map((line) => {
          if (line.periodEnd <= periodEnd) return line;
          const coveredDays =
            endDay - calendarDateToDayNumber(parseCalendarDate(line.periodStart)) + 1;
          return {
            ...line,
            periodEnd,
            coveredDays,
            amountMinor: prorateBillingAmount(
              line.baseRentAmountMinor,
              coveredDays,
              line.referenceDays,
            ),
          };
        });
      return {
        ...draft,
        sourceKey: `period:${draft.periodStart}:${periodEnd}`,
        periodEnd,
        effectiveEnd: periodEnd,
        dueDate: draft.periodStart,
        lines,
        amountMinor: sumBillingAmounts(lines.map((line) => line.amountMinor)),
      };
    });
}

/** 有效普通账单必须从接续起点连续覆盖，收款、创建日期与分页均不参与选择。 */
export function selectNextBillingPeriod(input: PeriodScheduleInput): BillingRentDraft | null {
  const periods = billingPeriods(input);
  const active = input.activePeriods.toSorted((a, b) => a.periodStart.localeCompare(b.periodStart));
  for (const [index, bill] of active.entries()) {
    const expected = periods[index];
    if (!expected || expected.periodStart !== bill.periodStart)
      throw new RangeError("有效账单未从出账起点连续覆盖账期");
    if (expected.periodEnd !== bill.periodEnd)
      throw new RangeError("有效账单结束日期不符合合同账期边界");
  }
  return periods[active.length] ?? null;
}
