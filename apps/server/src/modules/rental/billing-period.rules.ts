import type {
  BillingPlan,
  BillingRentDraft,
  BillingRentLine,
  BillingTerms,
} from "./billing.types.js";
import {
  addCalendarDays,
  calendarDateToDayNumber,
  dayNumberToCalendarDate,
  daysInMonth,
  formatCalendarDate,
  parseCalendarDate,
} from "./contract-date.rules.js";

/** 用 BigInt 汇总并拒绝溢出，不以浮点数累加金额。 */
export function sumBillingAmounts(amounts: number[]): number {
  const sum = amounts.reduce((total, amount) => total + BigInt(amount), 0n);
  if (sum < 0n || sum > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("应收金额合计超出安全整数范围");
  }
  return Number(sum);
}

/** 整数比例在月度片段末舍入，恰好一半时向上取整。 */
export function prorateBillingAmount(amount: number, coveredDays: number, referenceDays: number) {
  const numerator = BigInt(amount) * BigInt(coveredDays);
  const denominator = BigInt(referenceDays);
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}

function monthBoundary(start: ReturnType<typeof parseCalendarDate>, offset: number, day: number) {
  const monthIndex = start.year * 12 + start.month - 1 + offset;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return calendarDateToDayNumber({ year, month, day: Math.min(day, daysInMonth(year, month)) });
}

function dateAt(day: number) {
  return formatCalendarDate(dayNumberToCalendarDate(day));
}

/** 完整参考区间在日期上限外时仅保存天数，业务日期仍限制四位年份。 */
function referenceDateAt(day: number): string | null {
  const parts = dayNumberToCalendarDate(day);
  return parts.year > 9999 ? null : formatCalendarDate(parts);
}

/** 按原始起租锚点计算整个租期，不采用界面片段上限。 */
export function buildRentPlan(terms: BillingTerms): {
  drafts: BillingRentDraft[];
  totals: BillingPlan["totals"];
} {
  const start = parseCalendarDate(terms.startDate);
  const startDay = calendarDateToDayNumber(start);
  const endDay = calendarDateToDayNumber(parseCalendarDate(terms.endDate));
  if (endDay < startDay) throw new RangeError("租期顺序无效");
  if (!Number.isSafeInteger(terms.rentAmountMinor) || terms.rentAmountMinor <= 0) {
    throw new RangeError("月租必须是正安全整数");
  }
  const segments: BillingRentLine[] = [];
  const anchorDay = terms.billingAnchor === "calendar_month" ? 1 : start.day;
  for (let offset = 0; ; offset += 1) {
    const referenceStartDay = monthBoundary(start, offset, anchorDay);
    const segmentStartDay = Math.max(referenceStartDay, startDay);
    if (segmentStartDay > endDay) break;
    const referenceEndDay = monthBoundary(start, offset + 1, anchorDay) - 1;
    const segmentEndDay = Math.min(endDay, referenceEndDay);
    const coveredDays = segmentEndDay - segmentStartDay + 1;
    const referenceDays = referenceEndDay - referenceStartDay + 1;
    segments.push({
      kind: "rent_period",
      label: "月度租金",
      periodStart: dateAt(segmentStartDay),
      periodEnd: dateAt(segmentEndDay),
      referenceStart: dateAt(referenceStartDay),
      referenceEnd: referenceDateAt(referenceEndDay),
      coveredDays,
      referenceDays,
      baseRentAmountMinor: terms.rentAmountMinor,
      amountMinor: prorateBillingAmount(terms.rentAmountMinor, coveredDays, referenceDays),
      sortOrder: offset,
    });
  }
  const drafts: BillingRentDraft[] = [];
  for (let offset = 0; offset < segments.length; offset += terms.paymentIntervalMonths) {
    const lines = segments
      .slice(offset, offset + terms.paymentIntervalMonths)
      .map((line, index) => ({ ...line, sortOrder: index }));
    const periodStart = (lines[0] as BillingRentLine).periodStart;
    const periodEnd = (lines.at(-1) as BillingRentLine).periodEnd;
    drafts.push({
      type: "rent",
      sourceKey: `rent:${periodStart}:${periodEnd}`,
      periodStart,
      periodEnd,
      effectiveEnd: periodEnd,
      dueDate: addCalendarDays(periodStart, -terms.dueDaysBefore),
      amountMinor: sumBillingAmounts(lines.map((line) => line.amountMinor)),
      lines,
      depositSourceId: null,
      depositSnapshot: null,
    });
  }
  return {
    drafts,
    totals: {
      rentAmountMinor: sumBillingAmounts(drafts.map((draft) => draft.amountMinor)),
      depositAmountMinor: 0,
    },
  };
}
