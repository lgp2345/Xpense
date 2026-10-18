import type {
  RentalBillingPeriod,
  RentalBillingSpacePathNode,
  RentalContractLifecycleStatus,
  RentalPropertyBillingCandidate,
} from "@xpense/shared";
import type { BillingTerms } from "./billing.types.js";
import { calendarDateToDayNumber, parseCalendarDate } from "./contract-date.rules.js";
import { selectNextBillingPeriod } from "./period-schedule.rules.js";

/** 列表只读取账期资格及空间展示所需的窄输入，不依赖收费、抄表或收退款。 */
export type PropertyBillingSource = {
  contractId: string;
  spaceId: string;
  terms: BillingTerms;
  lifecycleStatus: RentalContractLifecycleStatus;
  cancelled: boolean;
  settled: boolean;
  spaceCount: number;
  terminationDate: string | null;
  firstPeriodStart: string | null;
  activePeriods: RentalBillingPeriod[];
  path: RentalBillingSpacePathNode[];
  tenantNames: string[];
};
export function billingStartDayDistance(today: string, periodStart: string): number {
  return (
    calendarDateToDayNumber(parseCalendarDate(periodStart)) -
    calendarDateToDayNumber(parseCalendarDate(today))
  );
}
export function toPropertyBillingCandidate(
  source: PropertyBillingSource,
  today: string,
): RentalPropertyBillingCandidate | null {
  if (
    !["confirmed", "terminated"].includes(source.lifecycleStatus) ||
    source.cancelled ||
    source.settled ||
    source.spaceCount !== 1
  )
    return null;
  const next = selectNextBillingPeriod({
    terms: source.terms,
    effectiveEndDate: source.terminationDate ?? source.terms.endDate,
    firstPeriodStart: source.firstPeriodStart ?? source.terms.startDate,
    activePeriods: source.activePeriods,
  });
  if (!next) return null;
  return {
    contractId: source.contractId,
    spaceId: source.spaceId,
    path: source.path,
    tenantNames: source.tenantNames,
    period: { periodStart: next.periodStart, periodEnd: next.periodEnd },
    daysUntilStart: billingStartDayDistance(today, next.periodStart),
  };
}
